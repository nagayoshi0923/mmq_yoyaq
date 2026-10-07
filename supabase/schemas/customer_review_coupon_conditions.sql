-- 使用履歴は既存coupon_usagesへ記録し、既存の原子的回数消費トリガーを利用。
CREATE TABLE public.private_group_coupon_uses (
 member_id uuid PRIMARY KEY REFERENCES public.private_group_members(id),
 usage_id uuid UNIQUE NOT NULL REFERENCES public.coupon_usages(id) ON DELETE CASCADE
);
ALTER TABLE public.private_group_coupon_uses ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.private_group_coupon_uses FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.validate_group_coupon(p_member uuid,p_coupon uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE m public.private_group_members; g public.private_groups; cc public.customer_coupons;
 r public.reservations; rules jsonb; amount integer; discount integer; usage uuid;
BEGIN
 SELECT * INTO m FROM public.private_group_members WHERE id=p_member;
 SELECT * INTO g FROM public.private_groups WHERE id=m.group_id FOR UPDATE;
 SELECT * INTO cc FROM public.customer_coupons WHERE id=p_coupon;
 PERFORM 1 FROM public.customers WHERE id=cc.customer_id FOR UPDATE;
 SELECT * INTO cc FROM public.customer_coupons WHERE id=p_coupon FOR UPDATE;
 SELECT * INTO g FROM public.private_groups WHERE id=m.group_id FOR UPDATE;
 SELECT * INTO m FROM public.private_group_members WHERE id=p_member FOR UPDATE;
 IF cc.id IS NULL OR m.status IS DISTINCT FROM 'joined' OR cc.organization_id IS DISTINCT FROM g.organization_id
 OR NOT EXISTS(SELECT 1 FROM public.customers WHERE id=cc.customer_id AND user_id=m.user_id) THEN
  RAISE EXCEPTION '本人のクーポンだけを利用できます' USING ERRCODE='P0028'; END IF;
 SELECT u.id,u.discount_amount INTO usage,discount FROM public.private_group_coupon_uses gu JOIN public.coupon_usages u ON u.id=gu.usage_id
 WHERE gu.member_id=m.id AND u.customer_coupon_id=cc.id;
 IF usage IS NOT NULL THEN RETURN jsonb_build_object('success',true,'discount',discount,'already_used',true); END IF;
 IF EXISTS(SELECT 1 FROM public.coupon_usages WHERE customer_coupon_id=cc.id AND reservation_id=g.reservation_id) THEN RAISE EXCEPTION 'この予約には使用済みです' USING ERRCODE='P0028'; END IF;
 IF EXISTS(SELECT 1 FROM public.private_group_coupon_uses WHERE member_id=m.id) THEN
  RAISE EXCEPTION '現在のクーポンを解除してから選び直してください' USING ERRCODE='P0028'; END IF;
 IF cc.status<>'active' OR cc.uses_remaining<=0 OR cc.expires_at<now()
 OR NOT EXISTS(SELECT 1 FROM public.coupon_campaigns WHERE id=cc.campaign_id AND organization_id=g.organization_id AND is_active) THEN
  RAISE EXCEPTION 'クーポンの状態・期限・残り回数を確認してください' USING ERRCODE='P0028'; END IF;
 rules:=cc.rules_snapshot; amount:=greatest(0,coalesce(m.payment_amount,g.per_person_price,0));
 IF rules IS NULL OR amount<=0 THEN RAISE EXCEPTION '金額・利用条件が未確定です' USING ERRCODE='P0028'; END IF;
 IF (rules->>'usage_valid_from')::timestamptz>now() OR (rules->>'usage_valid_until')::timestamptz<now() THEN
  RAISE EXCEPTION 'クーポンの利用期間外です' USING ERRCODE='P0028'; END IF;
 IF amount<coalesce((rules->>'min_order_amount')::integer,0) THEN RAISE EXCEPTION '最低利用金額に達していません' USING ERRCODE='P0028'; END IF;
 IF rules->>'target_type'='specific_organization' AND NOT coalesce(rules->'target_ids' ? g.organization_id::text,false) THEN
  RAISE EXCEPTION '対象組織ではありません' USING ERRCODE='P0028'; END IF;
 IF rules->>'target_type'='specific_scenarios' AND NOT(coalesce(rules->'target_ids' ? g.scenario_master_id::text,false)
 OR coalesce(rules->'target_ids' ? g.scenario_id::text,false) OR EXISTS(SELECT 1 FROM public.organization_scenarios os
 WHERE os.organization_id=g.organization_id AND os.scenario_master_id=g.scenario_master_id AND coalesce(rules->'target_ids' ? os.id::text,false))) THEN
  RAISE EXCEPTION '対象シナリオではありません' USING ERRCODE='P0028'; END IF;
 SELECT * INTO r FROM public.reservations WHERE id=g.reservation_id AND organization_id=g.organization_id;
 IF r.schedule_event_id IS NULL OR r.status NOT IN ('confirmed','checked_in') OR g.status<>'confirmed' THEN
  UPDATE public.private_group_members SET coupon_id=cc.id,coupon_discount=0,payment_amount=amount,final_amount=amount WHERE id=m.id;
  RETURN jsonb_build_object('success',true,'pending',true,'discount',0,'final_amount',amount);
 END IF;
 IF r.coupon_usage_enabled_snapshot=false OR NOT public.can_use_coupon_reservation(cc.customer_id,r.id) THEN
  RAISE EXCEPTION 'この予約には利用できません' USING ERRCODE='P0028'; END IF;
 discount:=public.coupon_discount_for_event(cc.id,r.schedule_event_id,amount,cc.customer_id,NULL);
 -- before-insert条件判定も同じメンバー金額を使う。
 UPDATE public.private_group_members SET coupon_id=cc.id,coupon_discount=discount,payment_amount=amount,final_amount=amount-discount WHERE id=m.id;
 INSERT INTO public.coupon_usages(customer_coupon_id,reservation_id,discount_amount) VALUES(cc.id,r.id,discount)
 RETURNING id,discount_amount INTO usage,discount;
 INSERT INTO public.private_group_coupon_uses(member_id,usage_id) VALUES(m.id,usage);
 RETURN jsonb_build_object('success',true,'pending',false,'discount',discount,'final_amount',amount-discount);
END $$;
REVOKE ALL ON FUNCTION public.validate_group_coupon(uuid,uuid) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.apply_coupon_to_group_member(p_member_id uuid,p_coupon_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE m public.private_group_members;
BEGIN
 PERFORM 1 FROM public.private_groups WHERE id=(SELECT group_id FROM public.private_group_members WHERE id=p_member_id) FOR UPDATE;
 SELECT * INTO m FROM public.private_group_members WHERE id=p_member_id FOR UPDATE;
 IF auth.uid() IS NULL OR m.status IS DISTINCT FROM 'joined' OR(m.user_id IS DISTINCT FROM auth.uid()
 AND public.private_group_actor_role(m.group_id) IS DISTINCT FROM 'staff') THEN
 RAISE EXCEPTION '本人のクーポンだけを変更できます' USING ERRCODE='42501'; END IF;
 IF m.coupon_id IS NOT NULL AND m.coupon_id IS DISTINCT FROM p_coupon_id THEN
  PERFORM public.remove_coupon_from_group_member(p_member_id);
 END IF;
 RETURN public.validate_group_coupon(p_member_id,p_coupon_id);
END $$;

CREATE OR REPLACE FUNCTION public.remove_coupon_from_group_member(p_member_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE m public.private_group_members; g public.private_groups; usage uuid; coupon uuid;
BEGIN
 PERFORM 1 FROM public.private_groups WHERE id=(SELECT group_id FROM public.private_group_members WHERE id=p_member_id) FOR UPDATE;
 SELECT * INTO m FROM public.private_group_members WHERE id=p_member_id FOR UPDATE;
 IF auth.uid() IS NULL OR m.status IS DISTINCT FROM 'joined' OR(m.user_id IS DISTINCT FROM auth.uid()
 AND public.private_group_actor_role(m.group_id) IS DISTINCT FROM 'staff') THEN
 RAISE EXCEPTION '本人のクーポンだけを変更できます' USING ERRCODE='42501'; END IF;
 -- グループ確定トリガーと同じグループ→顧客→クーポン→メンバーのロック順。
 SELECT * INTO g FROM public.private_groups WHERE id=m.group_id FOR UPDATE;
 PERFORM 1 FROM public.customers WHERE id=(SELECT customer_id FROM public.customer_coupons WHERE id=m.coupon_id) FOR UPDATE;
 PERFORM 1 FROM public.customer_coupons WHERE id=m.coupon_id FOR UPDATE;
 SELECT * INTO g FROM public.private_groups WHERE id=m.group_id FOR UPDATE;
 SELECT * INTO m FROM public.private_group_members WHERE id=p_member_id FOR UPDATE;
 SELECT u.id,u.customer_coupon_id INTO usage,coupon FROM public.private_group_coupon_uses gu JOIN public.coupon_usages u ON u.id=gu.usage_id WHERE gu.member_id=m.id;
 IF usage IS NOT NULL THEN
  DELETE FROM public.coupon_usages WHERE id=usage;
  UPDATE public.customer_coupons SET uses_remaining=uses_remaining+1,status=CASE WHEN status='fully_used' THEN 'active' ELSE status END WHERE id=coupon;
 END IF;
 UPDATE public.private_group_members SET coupon_id=NULL,coupon_discount=0,final_amount=coalesce(payment_amount,g.per_person_price,0) WHERE id=m.id;
 RETURN jsonb_build_object('success',true);
END $$;
REVOKE ALL ON FUNCTION public.apply_coupon_to_group_member(uuid,uuid),public.remove_coupon_from_group_member(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.apply_coupon_to_group_member(uuid,uuid),public.remove_coupon_from_group_member(uuid) TO authenticated,service_role;

CREATE OR REPLACE FUNCTION public.finalize_private_group_coupons() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE m record;
BEGIN
 IF NEW.status='confirmed' THEN
  FOR m IN SELECT id,coupon_id FROM public.private_group_members WHERE group_id=NEW.id AND status='joined' AND coupon_id IS NOT NULL ORDER BY user_id,id
  LOOP PERFORM public.validate_group_coupon(m.id,m.coupon_id); END LOOP;
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.finalize_private_group_coupons() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER finalize_private_group_coupons AFTER UPDATE OF status,reservation_id,per_person_price ON public.private_groups
FOR EACH ROW EXECUTE FUNCTION public.finalize_private_group_coupons();

CREATE OR REPLACE FUNCTION public.enforce_coupon_performance_scope()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r public.reservations; cc public.customer_coupons;
BEGIN
 IF TG_OP='UPDATE' THEN
  IF NEW.customer_coupon_id IS DISTINCT FROM OLD.customer_coupon_id OR NEW.reservation_id IS DISTINCT FROM OLD.reservation_id
   OR NEW.discount_amount IS DISTINCT FROM OLD.discount_amount THEN
   RAISE EXCEPTION '使用履歴の条件は変更できません。取消後に再利用してください' USING ERRCODE='P0028';
  END IF;
  RETURN NEW;
 END IF;
 SELECT * INTO r FROM public.reservations WHERE id=NEW.reservation_id;
 SELECT * INTO cc FROM public.customer_coupons WHERE id=NEW.customer_coupon_id;
 IF r.id IS NULL OR r.organization_id IS DISTINCT FROM cc.organization_id OR r.status NOT IN ('confirmed','checked_in')
  OR NOT public.can_use_coupon_reservation(cc.customer_id,r.id) THEN
  RAISE EXCEPTION '利用可能な予約を指定してください' USING ERRCODE='P0028';
 END IF;
 IF EXISTS(SELECT 1 FROM public.private_groups g JOIN public.private_group_members m ON m.group_id=g.id
 WHERE g.reservation_id=r.id AND g.organization_id=r.organization_id AND m.status='joined' AND m.coupon_id=cc.id
 AND m.user_id=(SELECT user_id FROM public.customers WHERE id=cc.customer_id)) THEN
  NEW.discount_amount:=public.coupon_discount_for_event(cc.id,r.schedule_event_id,
    (SELECT coalesce(m.payment_amount,g.per_person_price,0) FROM public.private_group_members m JOIN public.private_groups g ON g.id=m.group_id
     WHERE g.reservation_id=r.id AND m.coupon_id=cc.id AND m.status='joined' LIMIT 1),cc.customer_id,NULL);
 ELSE
  NEW.discount_amount:=public.coupon_discount_for_event(cc.id,r.schedule_event_id,r.total_price,cc.customer_id,r.id);
 END IF;
 RETURN NEW;
END;
$$;

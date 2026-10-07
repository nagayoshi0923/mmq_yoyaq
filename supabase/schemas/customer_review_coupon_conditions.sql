-- 使用履歴は既存coupon_usagesへ記録し、既存の原子的回数消費トリガーを利用。
CREATE TABLE public.private_group_coupon_uses (
 member_id uuid PRIMARY KEY REFERENCES public.private_group_members(id) ON DELETE CASCADE,
 usage_id uuid UNIQUE NOT NULL REFERENCES public.coupon_usages(id) ON DELETE CASCADE,
 validated_event_id uuid NOT NULL, validated_amount integer NOT NULL CHECK(validated_amount>0)
);
ALTER TABLE public.private_group_coupon_uses ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.private_group_coupon_uses FROM PUBLIC,anon,authenticated;

-- 全利用条件はこの内部関数1本。メンバー経路も予約時snapshotを使い、単価だけを本人メンバーから取得する。
CREATE OR REPLACE FUNCTION public.coupon_discount_for_event_internal(
 p_coupon uuid,p_event uuid,p_amount integer,p_customer uuid,p_reservation uuid,p_member uuid)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE cc public.customer_coupons; e public.schedule_events; locked_reservation public.reservations; rules jsonb;
 member_amount integer; prior record; scenario_key uuid; slot text; discount integer; used_amount integer:=0;
BEGIN
 -- 顧客行で直列化し、別クーポンを同時利用した場合にも併用/同作品制限を守る。
 PERFORM 1 FROM public.customers WHERE id=p_customer FOR UPDATE;
 SELECT * INTO cc FROM public.customer_coupons WHERE id=p_coupon FOR UPDATE;
 IF NOT FOUND OR cc.customer_id IS DISTINCT FROM p_customer THEN
  RAISE EXCEPTION 'クーポンが見つかりません' USING ERRCODE='P0028';
 END IF;
 IF cc.status<>'active' OR cc.uses_remaining<=0 OR (cc.expires_at IS NOT NULL AND cc.expires_at<now()) THEN
  RAISE EXCEPTION 'このクーポンは利用できません（残り回数・有効期限を確認してください）' USING ERRCODE='P0028';
 END IF;
 IF p_reservation IS NOT NULL THEN
  SELECT * INTO locked_reservation FROM public.reservations WHERE id=p_reservation FOR UPDATE;
  IF locked_reservation.id IS NULL OR locked_reservation.organization_id IS DISTINCT FROM cc.organization_id OR locked_reservation.status NOT IN ('confirmed','checked_in')
   OR NOT public.can_use_coupon_reservation(cc.customer_id,locked_reservation.id) THEN
   RAISE EXCEPTION '利用可能なご本人の予約を指定してください' USING ERRCODE='P0028';
  END IF;
  -- ロック前に取得された値は使わない。並行する人数変更・取消後の値で再判定する。
  IF p_member IS NULL THEN p_amount:=locked_reservation.total_price;
  ELSE
   SELECT greatest(0,coalesce(g.per_person_price,m.payment_amount,0)) INTO member_amount
   FROM public.private_group_members m JOIN public.private_groups g ON g.id=m.group_id
   JOIN public.customers owner ON owner.id=p_customer
   WHERE m.id=p_member AND m.status='joined' AND m.user_id=owner.user_id
    AND g.reservation_id=locked_reservation.id AND g.organization_id=locked_reservation.organization_id AND g.status='confirmed';
   IF member_amount IS NULL OR member_amount<=0 THEN RAISE EXCEPTION 'メンバーの確定金額がありません' USING ERRCODE='P0028'; END IF;
   p_amount:=member_amount;
  END IF;
  p_event:=locked_reservation.schedule_event_id;
 END IF;
 SELECT * INTO e FROM public.schedule_events WHERE id=p_event AND organization_id=cc.organization_id;
 IF NOT FOUND OR COALESCE(e.is_cancelled,false) THEN
  RAISE EXCEPTION 'この公演には利用できません' USING ERRCODE='P0028';
 END IF;
 IF p_reservation IS NULL THEN
  IF NOT (public.resolve_operating_setting(cc.organization_id,'coupon_usage_enabled','true'::jsonb,NULL,NULL,p_event)->>'value')::boolean THEN
   RAISE EXCEPTION 'この公演ではクーポンを利用できません' USING ERRCODE='P0028';
  END IF;
 ELSE
  IF EXISTS(SELECT 1 FROM public.reservations WHERE id=p_reservation AND coupon_usage_enabled_snapshot=false) THEN
   RAISE EXCEPTION 'この予約ではクーポンを利用できません' USING ERRCODE='P0028';
  END IF;
 END IF;
 rules:=cc.rules_snapshot;
 IF rules IS NULL OR p_amount IS NULL OR p_amount<=0 THEN
  RAISE EXCEPTION '利用条件または予約金額を確認できません' USING ERRCODE='P0028';
 END IF;
 IF (rules->>'usage_valid_from')::timestamptz>now() OR (rules->>'usage_valid_until')::timestamptz<now() THEN
  RAISE EXCEPTION 'クーポンの利用期間外です' USING ERRCODE='P0028';
 END IF;
 IF COALESCE((rules->>'murder_mystery_only')::boolean,false) AND NOT public.is_murder_mystery_coupon_event(e.category,
  e.scenario_master_id IS NOT NULL OR e.organization_scenario_id IS NOT NULL OR e.scenario_id IS NOT NULL) THEN
  RAISE EXCEPTION 'マーダーミステリーの通常公演・貸切のみで利用できます' USING ERRCODE='P0028';
 END IF;
 IF rules->>'target_type'='specific_organization' AND NOT COALESCE(rules->'target_ids' ? e.organization_id::text,false) THEN
  RAISE EXCEPTION '対象組織ではありません' USING ERRCODE='P0028';
 END IF;
 IF rules->>'target_type'='specific_scenarios' AND NOT (
  COALESCE(rules->'target_ids' ? e.organization_scenario_id::text,false) OR
  COALESCE(rules->'target_ids' ? e.scenario_master_id::text,false) OR
  COALESCE(rules->'target_ids' ? e.scenario_id::text,false)) THEN
  RAISE EXCEPTION '対象シナリオではありません' USING ERRCODE='P0028';
 END IF;
 IF jsonb_typeof(rules->'target_store_ids')='array' AND jsonb_array_length(rules->'target_store_ids')>0
  AND NOT COALESCE(rules->'target_store_ids' ? e.store_id::text,false) THEN
  RAISE EXCEPTION '対象店舗ではありません' USING ERRCODE='P0028';
 END IF;
 IF p_amount<COALESCE((rules->>'min_order_amount')::integer,0) THEN
  RAISE EXCEPTION '最低利用金額に達していません' USING ERRCODE='P0028';
 END IF;
 IF jsonb_typeof(rules->'allowed_weekdays')='array' AND jsonb_array_length(rules->'allowed_weekdays')>0 AND NOT
  rules->'allowed_weekdays' @> jsonb_build_array(extract(dow from e.date)::integer) THEN
  RAISE EXCEPTION '利用可能な曜日ではありません' USING ERRCODE='P0028';
 END IF;
 slot:=CASE WHEN e.time_slot IN ('朝','朝公演','午前','morning') THEN '朝'
  WHEN e.time_slot IN ('昼','昼公演','午後','afternoon') THEN '昼'
  WHEN e.time_slot IN ('夜','夜公演','夜間','evening') THEN '夜'
  WHEN e.start_time<'12:00' THEN '朝' WHEN e.start_time<'18:00' THEN '昼' ELSE '夜' END;
 IF jsonb_typeof(rules->'allowed_time_slots')='array' AND jsonb_array_length(rules->'allowed_time_slots')>0
  AND NOT (rules->'allowed_time_slots' ? slot OR rules->'allowed_time_slots' ? (slot||'公演')) THEN
  RAISE EXCEPTION '利用可能な時間帯ではありません' USING ERRCODE='P0028';
 END IF;
 IF p_reservation IS NOT NULL AND p_member IS NULL THEN
  SELECT COALESCE(sum(discount_amount),0)::integer INTO used_amount FROM public.coupon_usages WHERE reservation_id=p_reservation;
 END IF;
 scenario_key:=COALESCE(e.scenario_master_id,e.scenario_id,e.organization_scenario_id);
 FOR prior IN SELECT u.*,c.customer_id AS previous_customer,c.rules_snapshot AS previous_rules,
  COALESCE(se.scenario_master_id,se.scenario_id,se.organization_scenario_id) AS previous_scenario, se.scenario AS previous_title
  FROM public.coupon_usages u JOIN public.customer_coupons c ON c.id=u.customer_coupon_id
  JOIN public.reservations r ON r.id=u.reservation_id JOIN public.schedule_events se ON se.id=r.schedule_event_id
  WHERE c.customer_id=p_customer OR (u.reservation_id=p_reservation AND (p_member IS NULL
   OR NOT EXISTS(SELECT 1 FROM public.private_group_coupon_uses gu WHERE gu.usage_id=u.id)))
 LOOP
  IF prior.reservation_id=p_reservation THEN
   IF prior.customer_coupon_id=p_coupon THEN RAISE EXCEPTION 'この予約には使用済みです' USING ERRCODE='P0028'; END IF;
   IF NOT COALESCE((rules->>'combinable')::boolean,true) OR NOT COALESCE((prior.previous_rules->>'combinable')::boolean,true) THEN
    RAISE EXCEPTION '他のクーポンと併用できません' USING ERRCODE='P0028';
   END IF;
  ELSIF prior.previous_customer=p_customer AND ((scenario_key IS NOT NULL AND scenario_key=prior.previous_scenario) OR
   ((scenario_key IS NULL OR prior.previous_scenario IS NULL) AND NULLIF(btrim(e.scenario),'') IS NOT NULL AND btrim(e.scenario)=btrim(prior.previous_title))) AND COALESCE((rules->>'same_scenario_once')::boolean,true) THEN
   RAISE EXCEPTION 'この作品には既にクーポンをご利用済みです' USING ERRCODE='P0028';
  END IF;
 END LOOP;
 discount:=CASE rules->>'discount_type' WHEN 'fixed' THEN (rules->>'discount_amount')::integer
  WHEN 'percentage' THEN round(p_amount::numeric*(rules->>'discount_amount')::numeric/100)::integer END;
 discount:=LEAST(discount,GREATEST(p_amount-used_amount,0));
 IF p_member IS NOT NULL THEN discount:=LEAST(discount,GREATEST(coalesce(locked_reservation.final_price,locked_reservation.total_price,0),0)); END IF;
 IF discount IS NULL OR discount<=0 THEN RAISE EXCEPTION '割引できる金額がありません' USING ERRCODE='P0028'; END IF;
 RETURN discount;
END;
$$;
REVOKE ALL ON FUNCTION public.coupon_discount_for_event_internal(uuid,uuid,integer,uuid,uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
CREATE OR REPLACE FUNCTION public.coupon_discount_for_event(
 p_coupon uuid,p_event uuid,p_amount integer,p_customer uuid,p_reservation uuid DEFAULT NULL)
RETURNS integer LANGUAGE sql SECURITY DEFINER SET search_path=public AS $$
 SELECT public.coupon_discount_for_event_internal(p_coupon,p_event,p_amount,p_customer,p_reservation,NULL);
$$;
REVOKE ALL ON FUNCTION public.coupon_discount_for_event(uuid,uuid,integer,uuid,uuid) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.release_group_coupon_usage(p_member uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE u public.coupon_usages;
BEGIN
 SELECT cu.* INTO u FROM public.private_group_coupon_uses gu JOIN public.coupon_usages cu ON cu.id=gu.usage_id WHERE gu.member_id=p_member FOR UPDATE OF cu;
 IF u.id IS NULL THEN RETURN; END IF;
 UPDATE public.reservations SET discount_amount=greatest(coalesce(discount_amount,0)-u.discount_amount,0),
 final_price=coalesce(final_price,total_price,0)+u.discount_amount WHERE id=u.reservation_id;
 DELETE FROM public.coupon_usages WHERE id=u.id;
 UPDATE public.customer_coupons SET uses_remaining=uses_remaining+1,status=CASE WHEN status='fully_used' THEN 'active' ELSE status END WHERE id=u.customer_coupon_id;
END $$;
REVOKE ALL ON FUNCTION public.release_group_coupon_usage(uuid) FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.validate_group_coupon(p_member uuid,p_coupon uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE m public.private_group_members; g public.private_groups; cc public.customer_coupons;
 r public.reservations; rules jsonb; amount integer; discount integer; usage uuid; previous_reservation uuid; previous_amount integer; previous_event uuid;
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
 SELECT * INTO r FROM public.reservations WHERE id=g.reservation_id AND organization_id=g.organization_id FOR UPDATE;
 amount:=greatest(0,coalesce(g.per_person_price,m.payment_amount,0));
 SELECT u.id,u.discount_amount,u.reservation_id,gu.validated_amount,gu.validated_event_id INTO usage,discount,previous_reservation,previous_amount,previous_event
 FROM public.private_group_coupon_uses gu JOIN public.coupon_usages u ON u.id=gu.usage_id WHERE gu.member_id=m.id AND u.customer_coupon_id=cc.id;
 IF usage IS NOT NULL THEN
  IF previous_reservation=r.id AND previous_amount=amount AND previous_event=r.schedule_event_id AND g.status='confirmed' AND r.status IN ('confirmed','checked_in') THEN
   RETURN jsonb_build_object('success',true,'discount',discount,'already_used',true);
  END IF;
  -- 再予約・単価/公演変更: 旧請求と回数を戻してから現在条件で再適用。失敗なら全てrollback。
  PERFORM public.release_group_coupon_usage(m.id);
  SELECT * INTO cc FROM public.customer_coupons WHERE id=p_coupon;
 END IF;
 IF EXISTS(SELECT 1 FROM public.coupon_usages WHERE customer_coupon_id=cc.id AND reservation_id=g.reservation_id) THEN RAISE EXCEPTION 'この予約には使用済みです' USING ERRCODE='P0028'; END IF;
 IF EXISTS(SELECT 1 FROM public.private_group_coupon_uses WHERE member_id=m.id) THEN
  RAISE EXCEPTION '現在のクーポンを解除してから選び直してください' USING ERRCODE='P0028'; END IF;
 IF cc.status<>'active' OR cc.uses_remaining<=0 OR cc.expires_at<now()
 OR NOT EXISTS(SELECT 1 FROM public.coupon_campaigns WHERE id=cc.campaign_id AND organization_id=g.organization_id AND is_active) THEN
  RAISE EXCEPTION 'クーポンの状態・期限・残り回数を確認してください' USING ERRCODE='P0028'; END IF;
 rules:=cc.rules_snapshot;
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
 discount:=public.coupon_discount_for_event_internal(cc.id,r.schedule_event_id,amount,cc.customer_id,r.id,m.id);
 -- before-insert条件判定も同じメンバー金額を使う。
 UPDATE public.private_group_members SET coupon_id=cc.id,coupon_discount=discount,payment_amount=amount,final_amount=amount-discount WHERE id=m.id;
 INSERT INTO public.coupon_usages(customer_coupon_id,reservation_id,discount_amount) VALUES(cc.id,r.id,discount)
 RETURNING id,discount_amount INTO usage,discount;
 INSERT INTO public.private_group_coupon_uses(member_id,usage_id,validated_event_id,validated_amount) VALUES(m.id,usage,r.schedule_event_id,amount);
 UPDATE public.reservations SET discount_amount=coalesce(discount_amount,0)+discount,
 final_price=coalesce(final_price,total_price,0)-discount WHERE id=r.id;
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
 PERFORM public.release_group_coupon_usage(m.id);
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
  NEW.discount_amount:=public.coupon_discount_for_event_internal(cc.id,r.schedule_event_id,
    (SELECT coalesce(g.per_person_price,m.payment_amount,0) FROM public.private_group_members m JOIN public.private_groups g ON g.id=m.group_id
     WHERE g.reservation_id=r.id AND m.coupon_id=cc.id AND m.status='joined' LIMIT 1),cc.customer_id,r.id,
    (SELECT m.id FROM public.private_group_members m JOIN public.private_groups g ON g.id=m.group_id
     WHERE g.reservation_id=r.id AND m.coupon_id=cc.id AND m.status='joined' LIMIT 1));
 ELSE
  NEW.discount_amount:=public.coupon_discount_for_event(cc.id,r.schedule_event_id,r.total_price,cc.customer_id,r.id);
 END IF;
 RETURN NEW;
END;
$$;

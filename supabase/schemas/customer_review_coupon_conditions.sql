-- 請求へ実反映した使用だけを記録する私有台帳。旧履歴を推測で補正しない。
CREATE TABLE public.coupon_usage_billing_applied (
 usage_id uuid PRIMARY KEY REFERENCES public.coupon_usages(id) ON DELETE CASCADE,
 applied_amount integer NOT NULL CHECK(applied_amount>=0)
);
ALTER TABLE public.coupon_usage_billing_applied ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.coupon_usage_billing_applied FROM PUBLIC,anon,authenticated,service_role;

-- 使用履歴は既存coupon_usagesへ記録し、既存の原子的回数消費トリガーを利用。
CREATE TABLE public.private_group_coupon_uses (
 member_id uuid PRIMARY KEY REFERENCES public.private_group_members(id) ON DELETE CASCADE,
 usage_id uuid UNIQUE NOT NULL REFERENCES public.coupon_usages(id) ON DELETE CASCADE,
 validated_event_id uuid NOT NULL, validated_amount integer NOT NULL CHECK(validated_amount>0)
);
ALTER TABLE public.private_group_coupon_uses ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.private_group_coupon_uses FROM PUBLIC,anon,authenticated;

-- 全利用条件はこの内部関数1本。メンバー経路も予約時snapshotを使い、単価だけを本人メンバーから取得する。
-- 同じ本人の別顧客IDでもクーポン利用を直列化。本人未紐付けは顧客ID単位。
CREATE OR REPLACE FUNCTION public.lock_coupon_customer_identity(p_customer uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE actor uuid;
BEGIN
 SELECT user_id INTO actor FROM public.customers WHERE id=p_customer;
 PERFORM pg_advisory_xact_lock(hashtextextended(CASE WHEN actor IS NULL THEN 'coupon-customer:'||p_customer::text ELSE 'coupon-user:'||actor::text END,0));
END $$;
REVOKE ALL ON FUNCTION public.lock_coupon_customer_identity(uuid) FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.coupon_discount_for_event_internal(
 p_coupon uuid,p_event uuid,p_amount integer,p_customer uuid,p_reservation uuid,p_member uuid)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE cc public.customer_coupons; e public.schedule_events; locked_reservation public.reservations; rules jsonb;
 member_amount integer; prior record; scenario_key uuid; slot text; discount integer; used_amount integer:=0;
BEGIN
 -- 顧客行で直列化し、別クーポンを同時利用した場合にも併用/同作品制限を守る。
 PERFORM public.lock_coupon_customer_identity(p_customer);
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
  (c.customer_id=p_customer OR EXISTS(SELECT 1 FROM public.customers cu JOIN public.customers previous ON previous.user_id=cu.user_id WHERE cu.id=p_customer AND previous.id=c.customer_id AND cu.user_id IS NOT NULL)) AS same_customer_identity,
  COALESCE(se.scenario_master_id,se.scenario_id,se.organization_scenario_id) AS previous_scenario, se.scenario AS previous_title
  FROM public.coupon_usages u JOIN public.customer_coupons c ON c.id=u.customer_coupon_id
  JOIN public.reservations r ON r.id=u.reservation_id JOIN public.schedule_events se ON se.id=r.schedule_event_id
  WHERE c.customer_id=p_customer OR u.reservation_id=p_reservation
  OR EXISTS(SELECT 1 FROM public.customers cu JOIN public.customers previous ON previous.user_id=cu.user_id WHERE cu.id=p_customer AND previous.id=c.customer_id AND cu.user_id IS NOT NULL)
 LOOP
  IF prior.reservation_id=p_reservation THEN
   IF prior.customer_coupon_id=p_coupon THEN RAISE EXCEPTION 'この予約には使用済みです' USING ERRCODE='P0028'; END IF;
   IF NOT COALESCE((rules->>'combinable')::boolean,true) OR NOT COALESCE((prior.previous_rules->>'combinable')::boolean,true) THEN
    RAISE EXCEPTION '他のクーポンと併用できません' USING ERRCODE='P0028';
   END IF;
  ELSIF prior.same_customer_identity AND ((scenario_key IS NOT NULL AND scenario_key=prior.previous_scenario) OR
   ((scenario_key IS NULL OR prior.previous_scenario IS NULL) AND NULLIF(btrim(e.scenario),'') IS NOT NULL AND btrim(e.scenario)=btrim(prior.previous_title))) AND COALESCE((rules->>'same_scenario_once')::boolean,true) THEN
   RAISE EXCEPTION 'この作品には既にクーポンをご利用済みです' USING ERRCODE='P0028';
  END IF;
 END LOOP;
 discount:=CASE rules->>'discount_type' WHEN 'fixed' THEN (rules->>'discount_amount')::integer
  WHEN 'percentage' THEN round(p_amount::numeric*(rules->>'discount_amount')::numeric/100)::integer END;
 discount:=LEAST(discount,GREATEST(p_amount-used_amount,0));
 IF p_reservation IS NOT NULL THEN
  IF locked_reservation.final_price IS NULL THEN RAISE EXCEPTION '予約の請求額が未確定です。確認後にクーポンを利用してください' USING ERRCODE='P0028'; END IF;
  discount:=LEAST(discount,GREATEST(locked_reservation.final_price,0));
 END IF;
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

CREATE OR REPLACE FUNCTION public.release_departing_group_member_coupon()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 PERFORM public.release_group_coupon_usage(OLD.id);
 RETURN OLD;
END $$;
REVOKE ALL ON FUNCTION public.release_departing_group_member_coupon() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER release_departing_group_member_coupon BEFORE DELETE ON public.private_group_members
FOR EACH ROW EXECUTE FUNCTION public.release_departing_group_member_coupon();


CREATE OR REPLACE FUNCTION public.validate_group_coupon(p_member uuid,p_coupon uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE m public.private_group_members; g public.private_groups; cc public.customer_coupons;
 r public.reservations; rules jsonb; amount integer; discount integer; usage uuid; previous_reservation uuid; previous_amount integer; previous_event uuid;
BEGIN
 SELECT * INTO m FROM public.private_group_members WHERE id=p_member;
 SELECT * INTO g FROM public.private_groups WHERE id=m.group_id FOR UPDATE;
 SELECT * INTO cc FROM public.customer_coupons WHERE id=p_coupon;
 PERFORM public.lock_coupon_customer_identity(cc.customer_id);
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
 OR NOT EXISTS(SELECT 1 FROM public.coupon_campaigns WHERE id=cc.campaign_id AND organization_id=g.organization_id) THEN
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
 INSERT INTO public.coupon_usage_billing_applied(usage_id,applied_amount) VALUES(usage,discount);
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
 PERFORM public.lock_coupon_customer_identity((SELECT customer_id FROM public.customer_coupons WHERE id=m.coupon_id));
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

CREATE OR REPLACE FUNCTION public.use_customer_coupon(p_user uuid,p_coupon uuid,p_reservation uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE cc public.customer_coupons; r public.reservations; uid uuid; amount integer;
BEGIN
 SELECT c.* INTO cc FROM public.customer_coupons c JOIN public.customers cu ON cu.id=c.customer_id
 WHERE c.id=p_coupon AND cu.user_id=p_user;
 IF cc.id IS NULL THEN RAISE EXCEPTION 'クーポンが見つかりません' USING ERRCODE='P0028'; END IF;
 SELECT * INTO r FROM public.reservations WHERE id=p_reservation AND organization_id=cc.organization_id;
 IF r.id IS NULL OR NOT public.can_use_coupon_reservation(cc.customer_id,r.id) THEN
  RAISE EXCEPTION 'ご本人の予約を指定してください' USING ERRCODE='P0028';
 END IF;
 PERFORM public.lock_coupon_customer_identity(cc.customer_id);
 PERFORM 1 FROM public.customers WHERE id=cc.customer_id FOR UPDATE;
 SELECT id,discount_amount INTO uid,amount FROM public.coupon_usages WHERE customer_coupon_id=p_coupon AND reservation_id=p_reservation LIMIT 1;
 IF uid IS NOT NULL THEN RETURN jsonb_build_object('success',true,'usage_id',uid,'discount_amount',amount,'already_used',true); END IF;
 INSERT INTO public.coupon_usages(customer_coupon_id,reservation_id,discount_amount)
 VALUES(p_coupon,p_reservation,1) RETURNING id,discount_amount INTO uid,amount;
 -- 最新20261002160000の金額正本を保持。履歴と請求を同じTXで一度だけ更新。
 IF COALESCE(amount,0)>0 THEN
  UPDATE public.reservations SET discount_amount=COALESCE(discount_amount,0)+amount,
   final_price=GREATEST(COALESCE(final_price,total_price,0)-amount,0),updated_at=now() WHERE id=p_reservation;
 END IF;
 INSERT INTO public.coupon_usage_billing_applied(usage_id,applied_amount) VALUES(uid,coalesce(amount,0));
 RETURN jsonb_build_object('success',true,'usage_id',uid,'discount_amount',amount);
END;
$$;
REVOKE ALL ON FUNCTION public.use_customer_coupon(uuid,uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.use_customer_coupon(uuid,uuid,uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.restore_coupon_usage(p_organization uuid,p_coupon uuid,p_usage uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE cc public.customer_coupons; u public.coupon_usages; member uuid; target_group uuid; bill public.reservations; applied integer;
BEGIN
 SELECT * INTO cc FROM public.customer_coupons WHERE id=p_coupon AND organization_id=p_organization;
 IF cc.id IS NULL THEN RAISE EXCEPTION 'クーポンが見つかりません' USING ERRCODE='P0028'; END IF;
 SELECT gu.member_id,m.group_id INTO member,target_group FROM public.private_group_coupon_uses gu
 JOIN public.coupon_usages cu ON cu.id=gu.usage_id JOIN public.private_group_members m ON m.id=gu.member_id
 WHERE gu.usage_id=p_usage AND cu.customer_coupon_id=p_coupon;
 IF target_group IS NOT NULL THEN PERFORM 1 FROM public.private_groups WHERE id=target_group FOR UPDATE; END IF;
 PERFORM public.lock_coupon_customer_identity(cc.customer_id);
 PERFORM 1 FROM public.customers WHERE id=cc.customer_id FOR UPDATE;
 PERFORM 1 FROM public.customer_coupons WHERE id=p_coupon FOR UPDATE;
 IF member IS NOT NULL THEN PERFORM 1 FROM public.private_group_members WHERE id=member FOR UPDATE; END IF;
 PERFORM 1 FROM public.reservations WHERE id=(SELECT reservation_id FROM public.coupon_usages WHERE id=p_usage AND customer_coupon_id=p_coupon) FOR UPDATE;
 SELECT * INTO u FROM public.coupon_usages WHERE id=p_usage AND customer_coupon_id=p_coupon FOR UPDATE;
 IF u.id IS NULL THEN RETURN jsonb_build_object('success',true,'restored',false); END IF;
 SELECT * INTO bill FROM public.reservations WHERE id=u.reservation_id;
 IF bill.id IS NULL OR bill.discount_amount IS NULL OR bill.final_price IS NULL OR bill.total_price IS NULL THEN
  RAISE EXCEPTION '旧請求額が欠落しています。確認後に再実行してください' USING ERRCODE='P0061';
 END IF;
 SELECT applied_amount INTO applied FROM public.coupon_usage_billing_applied WHERE usage_id=u.id;
 IF applied IS NULL THEN
  -- 旧useは使用履歴だけ保存した。未控除と確定できる場合は請求を戻さない。
  IF bill.discount_amount=0 AND bill.final_price>=bill.total_price THEN applied:=0;
  ELSE RAISE EXCEPTION 'この旧利用は請求反映の確認が必要です。請求額・利用回数は変更していません' USING ERRCODE='P0061'; END IF;
 END IF;
 IF applied>coalesce(bill.discount_amount,0) OR applied>greatest(coalesce(bill.total_price,0)-coalesce(bill.final_price,bill.total_price,0),0) THEN
  RAISE EXCEPTION '請求と利用履歴が一致しません。確認後に再実行してください' USING ERRCODE='P0061';
 END IF;
 IF applied>0 THEN
  UPDATE public.reservations SET discount_amount=discount_amount-applied,
   final_price=coalesce(final_price,total_price,0)+applied,updated_at=now() WHERE id=u.reservation_id;
 END IF;
 DELETE FROM public.coupon_usages WHERE id=u.id;
 UPDATE public.customer_coupons SET uses_remaining=uses_remaining+1,status=CASE WHEN status='fully_used' THEN 'active' ELSE status END WHERE id=p_coupon;
 IF member IS NOT NULL THEN
  UPDATE public.private_group_members SET coupon_id=NULL,coupon_discount=0,
   final_amount=coalesce(payment_amount,(SELECT per_person_price FROM public.private_groups WHERE id=target_group),0) WHERE id=member;
 END IF;
 RETURN jsonb_build_object('success',true,'restored',true);
END;
$$;

REVOKE ALL ON FUNCTION public.restore_coupon_usage(uuid,uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.restore_coupon_usage(uuid,uuid,uuid) TO service_role;

-- QW-20260917-001: 既存の退出・削除動作を認証付きRPCへ移行。実データの一括変更はしない。
CREATE OR REPLACE FUNCTION public.private_group_remove_member(p_member_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE target_group uuid; target public.private_group_members%ROWTYPE; actor_role text;
BEGIN
 SELECT group_id INTO target_group FROM public.private_group_members WHERE id=p_member_id;
 IF target_group IS NULL THEN RAISE EXCEPTION 'メンバーを削除できません' USING ERRCODE='42501'; END IF;
 PERFORM 1 FROM public.private_groups WHERE id=target_group FOR UPDATE;
 actor_role:=public.private_group_actor_role(target_group);
 IF actor_role IS NULL THEN RAISE EXCEPTION 'メンバーを削除する管理権限がありません' USING ERRCODE='42501'; END IF;
 PERFORM public.lock_coupon_customer_identity((SELECT c.customer_id FROM public.customer_coupons c JOIN public.private_group_members m ON m.coupon_id=c.id WHERE m.id=p_member_id));
 PERFORM 1 FROM public.customers WHERE id=(SELECT c.customer_id FROM public.customer_coupons c JOIN public.private_group_members m ON m.coupon_id=c.id WHERE m.id=p_member_id) FOR UPDATE;
 PERFORM 1 FROM public.customer_coupons WHERE id=(SELECT coupon_id FROM public.private_group_members WHERE id=p_member_id) FOR UPDATE;
 SELECT * INTO target FROM public.private_group_members WHERE id=p_member_id AND group_id=target_group FOR UPDATE;
 IF NOT FOUND THEN RETURN; END IF;
 IF target.is_organizer AND actor_role<>'staff' THEN RAISE EXCEPTION '主催者を削除する権限がありません' USING ERRCODE='42501'; END IF;
 DELETE FROM public.private_group_members WHERE id=target.id AND group_id=target_group;
END $$;
REVOKE ALL ON FUNCTION public.private_group_remove_member(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.private_group_remove_member(uuid) TO authenticated,service_role;

CREATE OR REPLACE FUNCTION public.private_group_leave(p_group_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE organizer uuid; held record;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'ログインが必要です' USING ERRCODE='42501'; END IF;
 SELECT organizer_id INTO organizer FROM public.private_groups WHERE id=p_group_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'グループから退出できません' USING ERRCODE='42501'; END IF;
 IF organizer=auth.uid() OR EXISTS(SELECT 1 FROM public.private_group_members WHERE group_id=p_group_id AND user_id=auth.uid() AND is_organizer) THEN
  RAISE EXCEPTION '主催者は退出できません' USING ERRCODE='42501';
 END IF;
 FOR held IN SELECT cc.id,cc.customer_id FROM public.private_group_members m JOIN public.customer_coupons cc ON cc.id=m.coupon_id WHERE m.group_id=p_group_id AND m.user_id=auth.uid() ORDER BY cc.customer_id,cc.id LOOP
  PERFORM public.lock_coupon_customer_identity(held.customer_id);
  PERFORM 1 FROM public.customers WHERE id=held.customer_id FOR UPDATE;
  PERFORM 1 FROM public.customer_coupons WHERE id=held.id FOR UPDATE;
 END LOOP;
 -- 既存の同一user_idの複数行がある場合も、他人の行を残して本人だけを退出させる。
 DELETE FROM public.private_group_members WHERE group_id=p_group_id AND user_id=auth.uid();
END $$;
REVOKE ALL ON FUNCTION public.private_group_leave(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.private_group_leave(uuid) TO authenticated,service_role;

-- 廃止済み旧ゲスト削除は現行UI/APIから呼ばれない。serviceにも再公開しない。
DO $$BEGIN
 IF to_regprocedure('public.delete_guest_member(uuid)') IS NOT NULL THEN
  REVOKE ALL ON FUNCTION public.delete_guest_member(uuid) FROM PUBLIC,anon,authenticated,service_role;
 END IF;
 IF to_regprocedure('public.delete_guest_member(uuid,text)') IS NOT NULL THEN
  REVOKE ALL ON FUNCTION public.delete_guest_member(uuid,text) FROM PUBLIC,anon,authenticated,service_role;
 END IF;
END $$;

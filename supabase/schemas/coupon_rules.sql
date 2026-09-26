ALTER TABLE public.reservations ADD COLUMN IF NOT EXISTS coupon_usage_enabled_snapshot boolean;
-- QW-20260926-005: 配布時の条件を保持し、全利用経路で同じ判定を使う。
ALTER TABLE public.coupon_campaigns
  ADD COLUMN IF NOT EXISTS target_store_ids uuid[],
  ADD COLUMN IF NOT EXISTS same_scenario_once boolean NOT NULL DEFAULT true;
ALTER TABLE public.customer_coupons ADD COLUMN IF NOT EXISTS rules_snapshot jsonb;

CREATE OR REPLACE FUNCTION public.coupon_campaign_rules(p_campaign public.coupon_campaigns)
RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path=public AS $$
 SELECT jsonb_build_object(
  'discount_type',p_campaign.discount_type,'discount_amount',p_campaign.discount_amount,
  'target_type',p_campaign.target_type,'target_ids',p_campaign.target_ids,
  'target_store_ids',p_campaign.target_store_ids,'murder_mystery_only',p_campaign.murder_mystery_only,
  'usage_valid_from',p_campaign.usage_valid_from,'usage_valid_until',p_campaign.usage_valid_until,
  'min_order_amount',p_campaign.min_order_amount,'combinable',p_campaign.combinable,
  'allowed_weekdays',p_campaign.allowed_weekdays,'allowed_time_slots',p_campaign.allowed_time_slots,
  'same_scenario_once',p_campaign.same_scenario_once,'customer_terms',p_campaign.customer_terms);
$$;
REVOKE ALL ON FUNCTION public.coupon_campaign_rules(public.coupon_campaigns) FROM PUBLIC;

-- 過去の配布時点は復元できないため、移行直前の条件を保持する。使用履歴・期限は変更しない。
UPDATE public.customer_coupons cc SET rules_snapshot=public.coupon_campaign_rules(c)
FROM public.coupon_campaigns c WHERE cc.campaign_id=c.id AND cc.rules_snapshot IS NULL;

CREATE OR REPLACE FUNCTION public.snapshot_coupon_rules()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF TG_OP='UPDATE' THEN
  NEW.rules_snapshot:=OLD.rules_snapshot;
 ELSE
  SELECT public.coupon_campaign_rules(c) INTO NEW.rules_snapshot
  FROM public.coupon_campaigns c WHERE c.id=NEW.campaign_id AND c.organization_id=NEW.organization_id;
  IF NEW.rules_snapshot IS NULL THEN RAISE EXCEPTION 'クーポンの組織が一致しません' USING ERRCODE='P0028'; END IF;
 END IF;
 RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.snapshot_coupon_rules() FROM PUBLIC;
CREATE TRIGGER snapshot_coupon_rules BEFORE INSERT OR UPDATE ON public.customer_coupons
FOR EACH ROW EXECUTE FUNCTION public.snapshot_coupon_rules();

CREATE OR REPLACE FUNCTION public.coupon_discount_for_event(
 p_coupon uuid,p_event uuid,p_amount integer,p_customer uuid,p_reservation uuid DEFAULT NULL)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE cc public.customer_coupons; e public.schedule_events; locked_reservation public.reservations; rules jsonb;
 prior record; scenario_key uuid; slot text; discount integer; used_amount integer:=0;
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
  p_amount:=locked_reservation.total_price;
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
 IF p_reservation IS NOT NULL THEN
  SELECT COALESCE(sum(discount_amount),0)::integer INTO used_amount FROM public.coupon_usages WHERE reservation_id=p_reservation;
 END IF;
 scenario_key:=COALESCE(e.scenario_master_id,e.scenario_id,e.organization_scenario_id);
 FOR prior IN SELECT u.*,c.customer_id AS previous_customer,c.rules_snapshot AS previous_rules,
  COALESCE(se.scenario_master_id,se.scenario_id,se.organization_scenario_id) AS previous_scenario, se.scenario AS previous_title
  FROM public.coupon_usages u JOIN public.customer_coupons c ON c.id=u.customer_coupon_id
  JOIN public.reservations r ON r.id=u.reservation_id JOIN public.schedule_events se ON se.id=r.schedule_event_id
  WHERE c.customer_id=p_customer OR u.reservation_id=p_reservation
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
 IF discount IS NULL OR discount<=0 THEN RAISE EXCEPTION '割引できる金額がありません' USING ERRCODE='P0028'; END IF;
 RETURN discount;
END;
$$;
REVOKE ALL ON FUNCTION public.coupon_discount_for_event(uuid,uuid,integer,uuid,uuid) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.can_use_coupon_reservation(p_customer uuid,p_reservation uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT EXISTS(SELECT 1 FROM public.reservations r JOIN public.customers c ON c.id=p_customer
  WHERE r.id=p_reservation AND (r.customer_id=c.id OR EXISTS(
   SELECT 1 FROM public.private_groups g JOIN public.private_group_members m ON m.group_id=g.id
   WHERE g.reservation_id=r.id AND g.organization_id=r.organization_id AND m.user_id=c.user_id AND m.status='joined'
  ) OR EXISTS(
   SELECT 1 FROM public.staff st WHERE st.user_id=c.user_id AND st.organization_id=r.organization_id AND st.status='active'
    AND r.payment_method='staff' AND st.name=ANY(r.participant_names)
  )));
$$;
REVOKE ALL ON FUNCTION public.can_use_coupon_reservation(uuid,uuid) FROM PUBLIC,anon,authenticated;

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
 NEW.discount_amount:=public.coupon_discount_for_event(cc.id,r.schedule_event_id,r.total_price,cc.customer_id,r.id);
 RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS enforce_coupon_performance_scope ON public.coupon_usages;
CREATE TRIGGER enforce_coupon_performance_scope BEFORE INSERT OR UPDATE ON public.coupon_usages
FOR EACH ROW EXECUTE FUNCTION public.enforce_coupon_performance_scope();

-- サーバーが検証した本人IDのみを受け取る。顧客からの直接実行を禁止する。
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
 PERFORM 1 FROM public.customers WHERE id=cc.customer_id FOR UPDATE;
 SELECT id,discount_amount INTO uid,amount FROM public.coupon_usages WHERE customer_coupon_id=p_coupon AND reservation_id=p_reservation LIMIT 1;
 IF uid IS NOT NULL THEN RETURN jsonb_build_object('success',true,'usage_id',uid,'discount_amount',amount,'already_used',true); END IF;
 INSERT INTO public.coupon_usages(customer_coupon_id,reservation_id,discount_amount)
 VALUES(p_coupon,p_reservation,1) RETURNING id,discount_amount INTO uid,amount;
 RETURN jsonb_build_object('success',true,'usage_id',uid,'discount_amount',amount);
END;
$$;
REVOKE ALL ON FUNCTION public.use_customer_coupon(uuid,uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.use_customer_coupon(uuid,uuid,uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.snapshot_coupon_acceptance()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE scenario_id uuid;
BEGIN
 IF TG_OP='INSERT' AND NEW.schedule_event_id IS NULL THEN
  SELECT os.id INTO scenario_id FROM public.organization_scenarios os
   WHERE os.organization_id=NEW.organization_id
    AND (os.id=NEW.scenario_id OR os.scenario_master_id=COALESCE(NEW.scenario_master_id,NEW.scenario_id)) LIMIT 1;
 END IF;
 IF TG_OP='UPDATE' THEN NEW.coupon_usage_enabled_snapshot:=OLD.coupon_usage_enabled_snapshot;
 ELSE NEW.coupon_usage_enabled_snapshot:=(public.resolve_operating_setting(NEW.organization_id,'coupon_usage_enabled','true'::jsonb,NEW.store_id,scenario_id,NEW.schedule_event_id)->>'value')::boolean;
 END IF;
 RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.snapshot_coupon_acceptance() FROM PUBLIC;
CREATE TRIGGER snapshot_coupon_acceptance BEFORE INSERT OR UPDATE ON public.reservations
FOR EACH ROW EXECUTE FUNCTION public.snapshot_coupon_acceptance();

CREATE OR REPLACE FUNCTION public.preview_customer_coupon(p_user uuid,p_coupon uuid,p_reservation uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE cc public.customer_coupons; r public.reservations;
BEGIN
 SELECT c.* INTO cc FROM public.customer_coupons c JOIN public.customers cu ON cu.id=c.customer_id
 WHERE c.id=p_coupon AND cu.user_id=p_user;
 SELECT * INTO r FROM public.reservations WHERE id=p_reservation AND organization_id=cc.organization_id;
 IF cc.id IS NULL OR r.id IS NULL OR r.status NOT IN ('confirmed','checked_in') OR NOT public.can_use_coupon_reservation(cc.customer_id,r.id) THEN
  RAISE EXCEPTION 'ご本人の利用可能な予約を指定してください' USING ERRCODE='P0028';
 END IF;
 RETURN jsonb_build_object('success',true,'discount_amount',public.coupon_discount_for_event(cc.id,r.schedule_event_id,r.total_price,cc.customer_id,r.id));
END;
$$;
REVOKE ALL ON FUNCTION public.preview_customer_coupon(uuid,uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.preview_customer_coupon(uuid,uuid,uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.restore_coupon_usage(p_organization uuid,p_coupon uuid,p_usage uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE cc public.customer_coupons; removed uuid;
BEGIN
 SELECT * INTO cc FROM public.customer_coupons WHERE id=p_coupon AND organization_id=p_organization;
 IF cc.id IS NULL THEN RAISE EXCEPTION 'クーポンが見つかりません' USING ERRCODE='P0028'; END IF;
 PERFORM 1 FROM public.customers WHERE id=cc.customer_id FOR UPDATE;
 PERFORM 1 FROM public.customer_coupons WHERE id=p_coupon FOR UPDATE;
 DELETE FROM public.coupon_usages WHERE id=p_usage AND customer_coupon_id=p_coupon RETURNING id INTO removed;
 IF removed IS NOT NULL THEN
  UPDATE public.customer_coupons SET uses_remaining=uses_remaining+1,
    status=CASE WHEN status='fully_used' THEN 'active' ELSE status END WHERE id=p_coupon;
 END IF;
 RETURN jsonb_build_object('success',true,'restored',removed IS NOT NULL);
END;
$$;
REVOKE ALL ON FUNCTION public.restore_coupon_usage(uuid,uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.restore_coupon_usage(uuid,uuid,uuid) TO service_role;

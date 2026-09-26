-- TS setting-defaults.tsと同じ標準値。旧店舗値を標準値として復活させない。
CREATE OR REPLACE FUNCTION public.get_operating_setting_default(p_key text) RETURNS jsonb
LANGUAGE sql IMMUTABLE SET search_path = public
AS $$ SELECT '{"cancellation_policy":"","cancellation_policy_items":[{"id":"1","content":"キャンセルの際は必ず事前にご連絡ください"},{"id":"2","content":"キャンセル料は下記の計算基準と料率に基づき算出されます"},{"id":"3","content":"無断キャンセルの場合は100%のキャンセル料が発生します"}],"cancellation_deadline_hours":48,"cancellation_fees":[{"hours_before":48,"fee_percentage":50,"description":"前日より50%"},{"hours_before":24,"fee_percentage":100,"description":"当日より100%"},{"hours_before":-1,"fee_percentage":100,"description":"公演開始後・無断100%"}],"cancellation_fee_basis":"participant_total","private_cancellation_policy":"","private_cancellation_policy_items":[{"id":"1","content":"貸切予約には下記の貸切公演ポリシーが適用されます"},{"id":"2","content":"キャンセル料は下記の計算基準と料率に基づき算出されます"},{"id":"3","content":"日程変更は空き状況により可能な場合があります"}],"private_cancellation_deadline_hours":720,"private_cancellation_fees":[{"hours_before":168,"fee_percentage":50,"description":"7日前より公演価格全額の50%"},{"hours_before":72,"fee_percentage":100,"description":"3日前より公演価格全額の100%"},{"hours_before":-1,"fee_percentage":100,"description":"公演開始後・無断キャンセル100%"}],"private_cancellation_fee_basis":"performance_total","organizer_cancel_reasons":[{"id":"1","content":"最少催行人数に満たない場合"},{"id":"2","content":"自然災害、感染症の流行など不可抗力の場合"},{"id":"3","content":"店舗の都合によるやむを得ない事情がある場合"}],"organizer_cancel_refund_note":"参加料金は全額返金いたします。","cancellation_judgment_rules":[{"id":"1","timing":"前日 23:59","condition":"定員の過半数に満たない場合","result":"中止"},{"id":"2","timing":"前日 23:59","condition":"過半数以上だが最低開催人数に満たない場合","result":"公演ごとの開催判断期限まで募集を延長"},{"id":"3","timing":"前日 23:59","condition":"最低開催人数に達した場合","result":"開催確定"},{"id":"4","timing":"公演ごとの開催判断期限（延長された場合）","condition":"最低開催人数に満たない場合","result":"中止"}],"cancellation_notice_note":"中止が決定した場合、ご登録のメールアドレスに自動でお知らせします。中止の場合、参加料金は一切発生しません。","reservation_change_deadline_hours":24,"reservation_change_note":"参加人数の変更は、マイページに表示された変更期限まで行えます。日程の変更をご希望の場合は、一度キャンセルの上、再度ご予約をお願いいたします。この場合、キャンセル時期によってキャンセル料が発生する場合があります。","private_reservation_change_deadline_hours":168,"private_reservation_change_note":"貸切予約の変更は、表示された変更期限まで可能です。日程変更は空き状況によります。","refund_method_note":"当日現地決済のため、事前にお支払いいただく金額はありません。キャンセル料が発生した場合は、次回ご来店時にお支払いいただくか、別途ご連絡させていただきます。","payment_method_label":"現地決済","payment_method_description":"ご来店時にお支払いください","preparation_minutes":60,"judgment_minutes_before":240,"coupon_usage_enabled":true,"survey_enabled":false,"survey_deadline_days":1,"survey_url":""}'::jsonb->p_key; $$;
REVOKE ALL ON FUNCTION public.get_operating_setting_default(text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.get_operating_setting_default(text) TO service_role;

-- 予約処理・公開用RPC専用。任意の利用者から直接呼べない。
CREATE OR REPLACE FUNCTION public.resolve_operating_setting(
  p_organization_id uuid,
  p_key text,
  p_default jsonb DEFAULT 'null'::jsonb,
  p_store_id uuid DEFAULT NULL,
  p_scenario_id uuid DEFAULT NULL,
  p_event_id uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_store uuid := p_store_id;
  v_scenario uuid := p_scenario_id;
  v_event public.schedule_events%ROWTYPE;
  v_value jsonb := COALESCE(public.get_operating_setting_default(p_key), p_default);
  v_source text := 'default';
  v_scope text;
  v_legacy jsonb;
  v_override jsonb;
  v_candidate jsonb;
  v_keys constant text[] := ARRAY['cancellation_policy','cancellation_policy_items','cancellation_deadline_hours','cancellation_fees','cancellation_fee_basis','private_cancellation_policy','private_cancellation_policy_items','private_cancellation_deadline_hours','private_cancellation_fees','private_cancellation_fee_basis','organizer_cancel_reasons','organizer_cancel_refund_note','cancellation_judgment_rules','cancellation_notice_note','reservation_change_deadline_hours','reservation_change_note','private_reservation_change_deadline_hours','private_reservation_change_note','refund_method_note','payment_method_label','payment_method_description','company_name','company_phone','company_email','company_address','reminder_enabled','reminder_schedule','reservation_confirmation_template','cancellation_template','reminder_template','private_reminder_template','booking_change_template','private_request_template','private_confirm_template','private_rejection_template','waitlist_notify_template','waitlist_registration_template','performance_cancellation_template','performance_confirmation_template','event_cancellation_template','performance_extension_template','store_cancellation_template','private_rejection_reason','judgment_minutes_before','preparation_minutes','survey_enabled','survey_deadline_days','survey_url','coupon_usage_enabled'];
BEGIN
  IF p_key IS NULL OR NOT p_key = ANY(v_keys) THEN
    RAISE EXCEPTION 'unknown setting key' USING ERRCODE = '22023';
  END IF;
  IF p_event_id IS NOT NULL THEN
    SELECT * INTO v_event FROM public.schedule_events WHERE id = p_event_id AND organization_id = p_organization_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'event not found' USING ERRCODE = '42501'; END IF;
    v_store := v_event.store_id;
    v_scenario := v_event.organization_scenario_id;
    IF v_scenario IS NULL AND COALESCE(v_event.scenario_master_id,v_event.scenario_id) IS NOT NULL THEN
      SELECT id INTO v_scenario FROM public.organization_scenarios
        WHERE organization_id = p_organization_id AND scenario_master_id = COALESCE(v_event.scenario_master_id,v_event.scenario_id);
    END IF;
    IF (p_store_id IS NOT NULL AND p_store_id IS DISTINCT FROM v_store)
      OR (p_scenario_id IS NOT NULL AND p_scenario_id IS DISTINCT FROM v_scenario) THEN
      RAISE EXCEPTION 'event context mismatch' USING ERRCODE = '42501';
    END IF;
  END IF;
  IF v_store IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.stores WHERE id = v_store AND organization_id = p_organization_id) THEN
    RAISE EXCEPTION 'store not found' USING ERRCODE = '42501';
  END IF;
  IF v_scenario IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.organization_scenarios WHERE id = v_scenario AND organization_id = p_organization_id) THEN
    RAISE EXCEPTION 'scenario not found' USING ERRCODE = '42501';
  END IF;
  FOREACH v_scope IN ARRAY ARRAY['organization','store','scenario','performance'] LOOP
    IF (v_scope = 'store' AND v_store IS NULL) OR (v_scope = 'scenario' AND v_scenario IS NULL)
      OR (v_scope = 'performance' AND p_event_id IS NULL) THEN CONTINUE; END IF;
    IF p_key IN ('company_name','company_phone','company_email','company_address')
      AND v_scope IN ('scenario','performance') THEN CONTINUE; END IF;
    v_legacy := NULL;
    IF v_scope = 'organization' THEN
      SELECT to_jsonb(e)->p_key INTO v_legacy FROM public.email_settings e
        WHERE e.organization_id = p_organization_id AND e.store_id IS NULL ORDER BY e.id LIMIT 1;
    ELSIF v_scope = 'store' THEN
      SELECT to_jsonb(r)->p_key INTO v_legacy FROM public.reservation_settings r
        WHERE r.organization_id = p_organization_id AND r.store_id = v_store;
      IF v_legacy IS NULL THEN
        SELECT to_jsonb(e)->p_key INTO v_legacy FROM public.email_settings e
          WHERE e.organization_id = p_organization_id AND e.store_id = v_store;
      END IF;
    ELSIF v_scope = 'scenario' THEN
      IF p_key = 'preparation_minutes' THEN
        SELECT to_jsonb(60 + s.extra_preparation_time) INTO v_legacy FROM public.organization_scenarios s
          WHERE s.organization_id = p_organization_id AND s.id = v_scenario;
      ELSE
        SELECT to_jsonb(s)->p_key INTO v_legacy FROM public.organization_scenarios s
          WHERE s.organization_id = p_organization_id AND s.id = v_scenario;
      END IF;
    ELSIF v_scope = 'performance' THEN
      v_legacy := to_jsonb(v_event)->p_key;
    END IF;
    SELECT o.settings INTO v_override FROM public.operating_setting_overrides o
      WHERE o.organization_id = p_organization_id
      AND o.store_id IS NOT DISTINCT FROM (CASE WHEN v_scope = 'store' THEN v_store END)
      AND o.organization_scenario_id IS NOT DISTINCT FROM (CASE WHEN v_scope = 'scenario' THEN v_scenario END)
      AND o.schedule_event_id IS NOT DISTINCT FROM (CASE WHEN v_scope = 'performance' THEN p_event_id END);
    IF p_key IN ('company_name','company_phone','company_email','company_address','reminder_enabled','reminder_schedule','reservation_confirmation_template','cancellation_template','reminder_template','private_reminder_template','booking_change_template','private_request_template','private_confirm_template','private_rejection_template','waitlist_notify_template','waitlist_registration_template','performance_cancellation_template','performance_confirmation_template','event_cancellation_template','performance_extension_template','store_cancellation_template','private_rejection_reason')
      AND jsonb_typeof(v_legacy) = 'string' AND btrim(v_legacy #>> '{}') = '' THEN v_legacy := NULL; END IF;
    v_candidate := CASE WHEN v_override ? p_key THEN v_override->p_key ELSE v_legacy END;
    IF v_candidate IS NOT NULL AND v_candidate <> 'null'::jsonb THEN
      v_value := v_candidate;
      v_source := v_scope;
    END IF;
  END LOOP;
  RETURN jsonb_build_object('value', v_value, 'source', v_source);
END;
$$;
REVOKE ALL ON FUNCTION public.resolve_operating_setting(uuid,text,jsonb,uuid,uuid,uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_operating_setting(uuid,text,jsonb,uuid,uuid,uuid) TO service_role;

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
  COALESCE(se.scenario_master_id,se.scenario_id,se.organization_scenario_id) AS previous_scenario
  FROM public.coupon_usages u JOIN public.customer_coupons c ON c.id=u.customer_coupon_id
  JOIN public.reservations r ON r.id=u.reservation_id JOIN public.schedule_events se ON se.id=r.schedule_event_id
  WHERE c.organization_id=cc.organization_id AND (c.customer_id=p_customer OR u.reservation_id=p_reservation)
 LOOP
  IF prior.reservation_id=p_reservation THEN
   IF prior.customer_coupon_id=p_coupon THEN RAISE EXCEPTION 'この予約には使用済みです' USING ERRCODE='P0028'; END IF;
   IF NOT COALESCE((rules->>'combinable')::boolean,true) OR NOT COALESCE((prior.previous_rules->>'combinable')::boolean,true) THEN
    RAISE EXCEPTION '他のクーポンと併用できません' USING ERRCODE='P0028';
   END IF;
  ELSIF prior.previous_customer=p_customer AND scenario_key IS NOT NULL AND scenario_key=prior.previous_scenario AND COALESCE((rules->>'same_scenario_once')::boolean,true) THEN
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

CREATE OR REPLACE FUNCTION public.create_reservation_with_lock_v2(p_schedule_event_id uuid, p_participant_count integer, p_customer_id uuid, p_customer_name text, p_customer_email text, p_customer_phone text, p_notes text DEFAULT NULL::text, p_how_found text DEFAULT NULL::text, p_reservation_number text DEFAULT NULL::text, p_customer_coupon_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_max_participants INTEGER;
  v_current_participants INTEGER;
  v_available_seats INTEGER;
  v_reservation_id UUID;

  v_event_org_id UUID;
  v_scenario_id UUID;
  v_org_scenario_id UUID;
  v_store_id UUID;
  v_date DATE;
  v_start_time TIME;
  v_duration INTEGER;
  v_title TEXT;

  v_customer_user_id UUID;
  v_customer_org_id UUID;
  v_caller_org_id UUID;
  v_is_admin BOOLEAN;
  v_is_staff BOOLEAN;

  v_participation_fee INTEGER;
  v_participation_costs JSONB;
  v_custom_holiday BOOLEAN;

  v_unit_price INTEGER;
  v_total_price INTEGER;
  v_discount_amount INTEGER := 0;
  v_final_price INTEGER;
  v_requested_datetime TIMESTAMP;
  v_reservation_number TEXT;

  v_coupon RECORD;
  v_campaign RECORD;
  v_coupon_usage_id UUID;
BEGIN
  IF p_participant_count <= 0 THEN
    RAISE EXCEPTION 'INVALID_PARTICIPANT_COUNT' USING ERRCODE = 'P0001';
  END IF;

  SELECT organization_id,
         scenario_id,
         organization_scenario_id,
         store_id,
         date,
         start_time,
         COALESCE(max_participants, capacity, 8)
  INTO v_event_org_id, v_scenario_id, v_org_scenario_id, v_store_id, v_date, v_start_time, v_max_participants
  FROM schedule_events
  WHERE id = p_schedule_event_id
    AND is_cancelled = false
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'EVENT_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  v_caller_org_id := get_user_organization_id();
  v_is_admin := is_org_admin();
  v_is_staff := EXISTS (
    SELECT 1 FROM staff
    WHERE user_id = auth.uid()
      AND organization_id = v_event_org_id
      AND status = 'active'
  );

  IF p_customer_id IS NULL THEN
    IF NOT (v_is_admin OR v_is_staff) THEN
      RAISE EXCEPTION 'FORBIDDEN_STAFF_ONLY' USING ERRCODE = 'P0013';
    END IF;
    IF v_caller_org_id IS NOT NULL AND v_caller_org_id != v_event_org_id THEN
      RAISE EXCEPTION 'FORBIDDEN_ORG' USING ERRCODE = 'P0010';
    END IF;
    v_customer_user_id := NULL;
    v_customer_org_id := v_event_org_id;
  ELSE
    SELECT user_id, organization_id
    INTO v_customer_user_id, v_customer_org_id
    FROM customers
    WHERE id = p_customer_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'CUSTOMER_NOT_FOUND' USING ERRCODE = 'P0009';
    END IF;

    IF v_is_admin THEN
      NULL;
    ELSIF v_is_staff THEN
      IF v_caller_org_id != v_event_org_id THEN
        RAISE EXCEPTION 'FORBIDDEN_ORG' USING ERRCODE = 'P0010';
      END IF;
    ELSE
      -- customer ロール: 自分自身の予約のみ許可（platform customer は org を問わない）
      IF v_customer_user_id IS DISTINCT FROM auth.uid() THEN
        RAISE EXCEPTION 'FORBIDDEN_CUSTOMER' USING ERRCODE = 'P0011';
      END IF;
    END IF;

    -- platform customer (organization_id = NULL) は全組織で予約可
    -- guest customer (organization_id IS NOT NULL) は自組織のみ
    IF v_customer_org_id IS NOT NULL AND v_customer_org_id IS DISTINCT FROM v_event_org_id THEN
      RAISE EXCEPTION 'CUSTOMER_ORG_MISMATCH' USING ERRCODE = 'P0012';
    END IF;
  END IF;

  SELECT COALESCE(SUM(participant_count), 0)
  INTO v_current_participants
  FROM reservations
  WHERE schedule_event_id = p_schedule_event_id
    AND status IN ('pending', 'confirmed', 'gm_confirmed', 'checked_in');

  v_available_seats := v_max_participants - v_current_participants;

  IF v_available_seats <= 0 THEN
    RAISE EXCEPTION 'SOLD_OUT' USING ERRCODE = 'P0003';
  END IF;

  IF p_participant_count > v_available_seats THEN
    RAISE EXCEPTION 'INSUFFICIENT_SEATS' USING ERRCODE = 'P0004';
  END IF;

  IF v_org_scenario_id IS NOT NULL THEN
    SELECT
      os.participation_fee,
      os.participation_costs,
      COALESCE(os.duration, sm.official_duration),
      COALESCE(os.override_title, sm.title)
    INTO v_participation_fee, v_participation_costs, v_duration, v_title
    FROM organization_scenarios os
    JOIN scenario_masters sm ON sm.id = os.scenario_master_id
    WHERE os.id = v_org_scenario_id;
  ELSIF v_scenario_id IS NOT NULL THEN
    SELECT participation_fee, participation_costs, duration, title
    INTO v_participation_fee, v_participation_costs, v_duration, v_title
    FROM scenarios_v2
    WHERE id = v_scenario_id;

    IF NOT FOUND THEN
      SELECT participation_fee, participation_costs, duration, title
      INTO v_participation_fee, v_participation_costs, v_duration, v_title
      FROM scenarios
      WHERE id = v_scenario_id;
    END IF;
  END IF;

  IF v_participation_fee IS NULL AND v_title IS NULL THEN
    RAISE EXCEPTION 'SCENARIO_NOT_FOUND' USING ERRCODE = 'P0017';
  END IF;

  SELECT COALESCE(bool_or(COALESCE(os.custom_holidays, '[]'::JSONB) ? v_date::TEXT), FALSE)
  INTO v_custom_holiday
  FROM organization_settings os
  WHERE os.organization_id = v_event_org_id;

  v_unit_price := public.calculate_booking_participation_fee(
    v_participation_fee, v_participation_costs, v_date, v_start_time, v_custom_holiday
  );

  v_total_price := v_unit_price * p_participant_count;

  IF p_customer_coupon_id IS NOT NULL THEN
    v_discount_amount := public.coupon_discount_for_event(
      p_customer_coupon_id, p_schedule_event_id, v_total_price, p_customer_id, NULL);
  END IF;

  v_final_price := v_total_price - v_discount_amount;
  v_requested_datetime := (v_date + v_start_time)::TIMESTAMP;

  IF p_reservation_number IS NULL OR length(trim(p_reservation_number)) = 0 THEN
    v_reservation_number := to_char(now(), 'YYMMDD') || '-' || upper(substr(md5(random()::text), 1, 4));
  ELSE
    v_reservation_number := p_reservation_number;
  END IF;

  INSERT INTO reservations (
    schedule_event_id,
    scenario_id,
    store_id,
    customer_id,
    customer_name,
    customer_email,
    customer_phone,
    requested_datetime,
    duration,
    participant_count,
    participant_names,
    base_price,
    options_price,
    total_price,
    discount_amount,
    final_price,
    unit_price,
    payment_method,
    payment_status,
    status,
    customer_notes,
    reservation_number,
    created_by,
    organization_id,
    title
  ) VALUES (
    p_schedule_event_id,
    COALESCE(v_scenario_id, v_org_scenario_id),
    v_store_id,
    p_customer_id,
    p_customer_name,
    p_customer_email,
    p_customer_phone,
    v_requested_datetime,
    v_duration,
    p_participant_count,
    ARRAY[]::text[],
    v_total_price,
    0,
    v_total_price,
    v_discount_amount,
    v_final_price,
    v_unit_price,
    CASE WHEN p_customer_id IS NULL THEN 'staff' ELSE 'onsite' END,
    'pending',
    'confirmed',
    p_notes,
    v_reservation_number,
    auth.uid(),
    v_event_org_id,
    COALESCE(v_title, '')
  )
  RETURNING id INTO v_reservation_id;

  IF p_customer_coupon_id IS NOT NULL AND v_discount_amount > 0 THEN
    INSERT INTO coupon_usages (
      customer_coupon_id,
      reservation_id,
      discount_amount
    ) VALUES (
      p_customer_coupon_id,
      v_reservation_id,
      v_discount_amount
    )
    RETURNING id INTO v_coupon_usage_id;

    UPDATE reservations SET coupon_usage_id = v_coupon_usage_id WHERE id = v_reservation_id;

  END IF;

  -- current_participants は reservations INSERT 後の recalc トリガーが絶対値で再計算する。
  -- checked_in を含まない手動 += はトリガー結果を過小上書きするため削除。

  RETURN v_reservation_id;
END;
$function$
;

NOTIFY pgrst, 'reload schema';

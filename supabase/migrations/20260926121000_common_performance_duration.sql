-- 旧店舗値を保持し、組織共通と店舗の明示指定/継承を解決する。既存行の更新なし。
CREATE OR REPLACE FUNCTION public.get_operating_setting_default(p_key text)
 RETURNS jsonb
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$ SELECT '{"cancellation_policy":"","cancellation_policy_items":[{"id":"1","content":"キャンセルの際は必ず事前にご連絡ください"},{"id":"2","content":"キャンセル料は下記の計算基準と料率に基づき算出されます"},{"id":"3","content":"無断キャンセルの場合は100%のキャンセル料が発生します"}],"cancellation_deadline_hours":48,"cancellation_fees":[{"hours_before":48,"fee_percentage":50,"description":"前日より50%"},{"hours_before":24,"fee_percentage":100,"description":"当日より100%"},{"hours_before":-1,"fee_percentage":100,"description":"公演開始後・無断100%"}],"cancellation_fee_basis":"participant_total","private_cancellation_policy":"","private_cancellation_policy_items":[{"id":"1","content":"貸切予約には下記の貸切公演ポリシーが適用されます"},{"id":"2","content":"キャンセル料は下記の計算基準と料率に基づき算出されます"},{"id":"3","content":"日程変更は空き状況により可能な場合があります"}],"private_cancellation_deadline_hours":720,"private_cancellation_fees":[{"hours_before":168,"fee_percentage":50,"description":"7日前より公演価格全額の50%"},{"hours_before":72,"fee_percentage":100,"description":"3日前より公演価格全額の100%"},{"hours_before":-1,"fee_percentage":100,"description":"公演開始後・無断キャンセル100%"}],"private_cancellation_fee_basis":"performance_total","organizer_cancel_reasons":[{"id":"1","content":"最少催行人数に満たない場合"},{"id":"2","content":"自然災害、感染症の流行など不可抗力の場合"},{"id":"3","content":"店舗の都合によるやむを得ない事情がある場合"}],"organizer_cancel_refund_note":"参加料金は全額返金いたします。","cancellation_judgment_rules":[{"id":"1","timing":"前日 23:59","condition":"定員の過半数に満たない場合","result":"中止"},{"id":"2","timing":"前日 23:59","condition":"過半数以上だが最低開催人数に満たない場合","result":"公演ごとの開催判断期限まで募集を延長"},{"id":"3","timing":"前日 23:59","condition":"最低開催人数に達した場合","result":"開催確定"},{"id":"4","timing":"公演ごとの開催判断期限（延長された場合）","condition":"最低開催人数に満たない場合","result":"中止"}],"cancellation_notice_note":"中止が決定した場合、ご登録のメールアドレスに自動でお知らせします。中止の場合、参加料金は一切発生しません。","reservation_change_deadline_hours":24,"reservation_change_note":"参加人数の変更は、マイページに表示された変更期限まで行えます。日程の変更をご希望の場合は、一度キャンセルの上、再度ご予約をお願いいたします。この場合、キャンセル時期によってキャンセル料が発生する場合があります。","private_reservation_change_deadline_hours":168,"private_reservation_change_note":"貸切予約の変更は、表示された変更期限まで可能です。日程変更は空き状況によります。","refund_method_note":"当日現地決済のため、事前にお支払いいただく金額はありません。キャンセル料が発生した場合は、次回ご来店時にお支払いいただくか、別途ご連絡させていただきます。","payment_method_label":"現地決済","payment_method_description":"ご来店時にお支払いください","default_performance_duration":180,"preparation_minutes":60,"judgment_minutes_before":240,"coupon_usage_enabled":true,"survey_enabled":false,"survey_deadline_days":1,"survey_url":""}'::jsonb->p_key; $function$
;
CREATE OR REPLACE FUNCTION public.resolve_operating_setting(p_organization_id uuid, p_key text, p_default jsonb DEFAULT 'null'::jsonb, p_store_id uuid DEFAULT NULL::uuid, p_scenario_id uuid DEFAULT NULL::uuid, p_event_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  v_keys constant text[] := ARRAY['cancellation_policy','cancellation_policy_items','cancellation_deadline_hours','cancellation_fees','cancellation_fee_basis','private_cancellation_policy','private_cancellation_policy_items','private_cancellation_deadline_hours','private_cancellation_fees','private_cancellation_fee_basis','organizer_cancel_reasons','organizer_cancel_refund_note','cancellation_judgment_rules','cancellation_notice_note','reservation_change_deadline_hours','reservation_change_note','private_reservation_change_deadline_hours','private_reservation_change_note','refund_method_note','payment_method_label','payment_method_description','company_name','company_phone','company_email','company_address','reminder_enabled','reminder_schedule','reservation_confirmation_template','cancellation_template','reminder_template','private_reminder_template','booking_change_template','private_request_template','private_confirm_template','private_rejection_template','waitlist_notify_template','waitlist_registration_template','performance_cancellation_template','performance_confirmation_template','event_cancellation_template','performance_extension_template','store_cancellation_template','private_rejection_reason','judgment_minutes_before','preparation_minutes','survey_enabled','survey_deadline_days','survey_url','coupon_usage_enabled','default_performance_duration'];
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
    IF p_key IN ('company_name','company_phone','company_email','company_address','default_performance_duration')
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
      IF p_key = 'default_performance_duration' THEN
        SELECT to_jsonb(p.default_duration) INTO v_legacy FROM public.performance_schedule_settings p
          WHERE p.organization_id = p_organization_id AND p.store_id = v_store;
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
$function$
;



NOTIFY pgrst, 'reload schema';

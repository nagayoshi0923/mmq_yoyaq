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
          WHERE p.store_id = v_store AND (p.organization_id = p_organization_id OR p.organization_id IS NULL);
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

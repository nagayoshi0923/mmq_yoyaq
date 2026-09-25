-- 組織共通と個別指定の差分。サービス側APIだけが読み書きする。
-- JSONの未指定キーは従来値、nullは明示的な継承、値ありは個別指定。
CREATE TABLE public.operating_setting_overrides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  store_id uuid REFERENCES public.stores(id) ON DELETE CASCADE,
  organization_scenario_id uuid REFERENCES public.organization_scenarios(id) ON DELETE CASCADE,
  schedule_event_id uuid REFERENCES public.schedule_events(id) ON DELETE CASCADE,
  settings jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(settings) = 'object'),
  revision bigint NOT NULL DEFAULT 1,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (num_nonnulls(store_id, organization_scenario_id, schedule_event_id) <= 1),
  UNIQUE NULLS NOT DISTINCT (organization_id, store_id, organization_scenario_id, schedule_event_id)
);
REVOKE ALL ON public.operating_setting_overrides FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.operating_setting_overrides TO service_role;
ALTER TABLE public.operating_setting_overrides ENABLE ROW LEVEL SECURITY;
-- 認証・項目の型検証は管理者限定API。ここでも所属と楽観ロックを強制する。
CREATE OR REPLACE FUNCTION public.save_operating_setting_overrides(
  p_organization_id uuid,
  p_scope text,
  p_target_id uuid,
  p_values jsonb,
  p_expected_revision bigint
) RETURNS bigint
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_store uuid;
  v_scenario uuid;
  v_event uuid;
  v_revision bigint;
BEGIN
  IF p_values IS NULL OR jsonb_typeof(p_values) <> 'object'
    OR p_expected_revision IS NULL OR p_expected_revision < 0 THEN
    RAISE EXCEPTION 'invalid setting update' USING ERRCODE = '22023';
  END IF;
  IF p_scope = 'organization' THEN
    IF p_target_id IS DISTINCT FROM p_organization_id
      OR NOT EXISTS (SELECT 1 FROM public.organizations WHERE id = p_organization_id) THEN
      RAISE EXCEPTION 'organization not found' USING ERRCODE = '42501';
    END IF;
  ELSIF p_scope = 'store' THEN
    SELECT id INTO v_store FROM public.stores
      WHERE id = p_target_id AND organization_id = p_organization_id;
    IF v_store IS NULL THEN RAISE EXCEPTION 'store not found' USING ERRCODE = '42501'; END IF;
  ELSIF p_scope = 'scenario' THEN
    SELECT id INTO v_scenario FROM public.organization_scenarios
      WHERE id = p_target_id AND organization_id = p_organization_id;
    IF v_scenario IS NULL THEN RAISE EXCEPTION 'scenario not found' USING ERRCODE = '42501'; END IF;
  ELSIF p_scope = 'performance' THEN
    SELECT id INTO v_event FROM public.schedule_events
      WHERE id = p_target_id AND organization_id = p_organization_id;
    IF v_event IS NULL THEN RAISE EXCEPTION 'performance not found' USING ERRCODE = '42501'; END IF;
  ELSE
    RAISE EXCEPTION 'invalid setting scope' USING ERRCODE = '22023';
  END IF;

  IF p_expected_revision = 0 THEN
    INSERT INTO public.operating_setting_overrides
      (organization_id, store_id, organization_scenario_id, schedule_event_id, settings)
    VALUES (p_organization_id, v_store, v_scenario, v_event, p_values)
    ON CONFLICT (organization_id, store_id, organization_scenario_id, schedule_event_id) DO NOTHING
    RETURNING revision INTO v_revision;
  ELSE
    UPDATE public.operating_setting_overrides s
    SET settings = s.settings || p_values, revision = s.revision + 1, updated_at = now()
    WHERE s.organization_id = p_organization_id
      AND s.store_id IS NOT DISTINCT FROM v_store
      AND s.organization_scenario_id IS NOT DISTINCT FROM v_scenario
      AND s.schedule_event_id IS NOT DISTINCT FROM v_event
      AND s.revision = p_expected_revision
    RETURNING s.revision INTO v_revision;
  END IF;
  IF v_revision IS NULL THEN
    RAISE EXCEPTION 'settings changed; reload before saving' USING ERRCODE = '40001';
  END IF;
  RETURN v_revision;
END;
$$;
REVOKE ALL ON FUNCTION public.save_operating_setting_overrides(uuid, text, uuid, jsonb, bigint) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.save_operating_setting_overrides(uuid, text, uuid, jsonb, bigint) TO service_role;
-- TS setting-defaults.tsと同じ標準値。旧店舗値を標準値として復活させない。
CREATE OR REPLACE FUNCTION public.get_operating_setting_default(p_key text) RETURNS jsonb
LANGUAGE sql IMMUTABLE SET search_path = public
AS $$ SELECT '{"cancellation_policy":"","cancellation_policy_items":[{"id":"1","content":"キャンセルの際は必ず事前にご連絡ください"},{"id":"2","content":"キャンセル料は下記の計算基準と料率に基づき算出されます"},{"id":"3","content":"無断キャンセルの場合は100%のキャンセル料が発生します"}],"cancellation_deadline_hours":48,"cancellation_fees":[{"hours_before":48,"fee_percentage":50,"description":"前日より50%"},{"hours_before":24,"fee_percentage":100,"description":"当日より100%"},{"hours_before":-1,"fee_percentage":100,"description":"公演開始後・無断100%"}],"cancellation_fee_basis":"participant_total","private_cancellation_policy":"","private_cancellation_policy_items":[{"id":"1","content":"貸切予約には下記の貸切公演ポリシーが適用されます"},{"id":"2","content":"キャンセル料は下記の計算基準と料率に基づき算出されます"},{"id":"3","content":"日程変更は空き状況により可能な場合があります"}],"private_cancellation_deadline_hours":720,"private_cancellation_fees":[{"hours_before":168,"fee_percentage":50,"description":"7日前より公演価格全額の50%"},{"hours_before":72,"fee_percentage":100,"description":"3日前より公演価格全額の100%"},{"hours_before":-1,"fee_percentage":100,"description":"公演開始後・無断キャンセル100%"}],"private_cancellation_fee_basis":"performance_total","organizer_cancel_reasons":[{"id":"1","content":"最少催行人数に満たない場合"},{"id":"2","content":"自然災害、感染症の流行など不可抗力の場合"},{"id":"3","content":"店舗の都合によるやむを得ない事情がある場合"}],"organizer_cancel_refund_note":"参加料金は全額返金いたします。","cancellation_judgment_rules":[{"id":"1","timing":"前日 23:59","condition":"定員の過半数に満たない場合","result":"中止"},{"id":"2","timing":"前日 23:59","condition":"過半数以上だが最低開催人数に満たない場合","result":"公演ごとの開催判断期限まで募集を延長"},{"id":"3","timing":"前日 23:59","condition":"最低開催人数に達した場合","result":"開催確定"},{"id":"4","timing":"公演ごとの開催判断期限（延長された場合）","condition":"最低開催人数に満たない場合","result":"中止"}],"cancellation_notice_note":"中止が決定した場合、ご登録のメールアドレスに自動でお知らせします。中止の場合、参加料金は一切発生しません。","reservation_change_deadline_hours":24,"reservation_change_note":"参加人数の変更は、マイページに表示された変更期限まで行えます。日程の変更をご希望の場合は、一度キャンセルの上、再度ご予約をお願いいたします。この場合、キャンセル時期によってキャンセル料が発生する場合があります。","private_reservation_change_deadline_hours":168,"private_reservation_change_note":"貸切予約の変更は、表示された変更期限まで可能です。日程変更は空き状況によります。","refund_method_note":"当日現地決済のため、事前にお支払いいただく金額はありません。キャンセル料が発生した場合は、次回ご来店時にお支払いいただくか、別途ご連絡させていただきます。","payment_method_label":"現地決済","payment_method_description":"ご来店時にお支払いください","preparation_minutes":60,"judgment_minutes_before":240,"survey_enabled":false,"survey_deadline_days":1,"survey_url":""}'::jsonb->p_key; $$;
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
  v_keys constant text[] := ARRAY['cancellation_policy','cancellation_policy_items','cancellation_deadline_hours','cancellation_fees','cancellation_fee_basis','private_cancellation_policy','private_cancellation_policy_items','private_cancellation_deadline_hours','private_cancellation_fees','private_cancellation_fee_basis','organizer_cancel_reasons','organizer_cancel_refund_note','cancellation_judgment_rules','cancellation_notice_note','reservation_change_deadline_hours','reservation_change_note','private_reservation_change_deadline_hours','private_reservation_change_note','refund_method_note','payment_method_label','payment_method_description','company_name','company_phone','company_email','company_address','reminder_enabled','reminder_schedule','reservation_confirmation_template','cancellation_template','reminder_template','private_reminder_template','booking_change_template','private_request_template','private_confirm_template','private_rejection_template','waitlist_notify_template','waitlist_registration_template','performance_cancellation_template','performance_confirmation_template','event_cancellation_template','performance_extension_template','store_cancellation_template','private_rejection_reason','judgment_minutes_before','preparation_minutes','survey_enabled','survey_deadline_days','survey_url'];
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
-- 公開承認された組織の支払い案内2項目だけを公開する。
CREATE OR REPLACE FUNCTION public.get_public_payment_settings(p_organization_slug text, p_event_id uuid)
RETURNS TABLE(payment_method_label text, payment_method_description text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_org uuid;
BEGIN
  SELECT o.id INTO v_org FROM public.organizations o
    JOIN public.schedule_events e ON e.organization_id = o.id AND e.id = p_event_id
    JOIN public.stores s ON s.id = e.store_id AND s.organization_id = o.id AND s.status = 'active'
    WHERE o.slug = p_organization_slug AND o.is_active = true AND o.booking_site_status = 'approved'
      AND COALESCE(e.is_cancelled, false) = false;
  IF v_org IS NULL THEN RETURN; END IF;
  RETURN QUERY SELECT
    public.resolve_operating_setting(v_org, 'payment_method_label', to_jsonb('現地決済'::text), NULL, NULL, p_event_id)->>'value',
    public.resolve_operating_setting(v_org, 'payment_method_description', to_jsonb('ご来店時にお支払いください'::text), NULL, NULL, p_event_id)->>'value';
END;
$$;
REVOKE ALL ON FUNCTION public.get_public_payment_settings(text,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_payment_settings(text,uuid) TO anon, authenticated, service_role;

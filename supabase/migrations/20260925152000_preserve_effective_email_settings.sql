-- 旧メール取得は空欄を組織内の別店舗で補完していた。
-- その実効文面だけ個別指定へ固定し、今後は明示的な組織共通を参照する。
-- 旧列は変更しない。新しい設定が既に存在する場合も上書きしない。
DO $$
DECLARE
 o record;
 s record;
 candidate record;
 k text;
 source_rows jsonb;
 effective jsonb;
 existing jsonb;
 preserved jsonb;
 legacy_keys constant text[] := ARRAY[
  'company_name','company_email','company_phone','company_address','reservation_confirmation_template',
  'cancellation_template','reminder_template','booking_change_template','private_request_template',
  'private_confirm_template','private_rejection_template','waitlist_notify_template',
  'waitlist_registration_template','performance_cancellation_template','event_cancellation_template',
  'performance_extension_template','performance_confirmation_template'];
BEGIN
 FOR o IN SELECT id FROM public.organizations LOOP
  SELECT COALESCE(jsonb_agg(row_data),'[]'::jsonb) INTO source_rows
   FROM (SELECT to_jsonb(e) row_data FROM public.email_settings e WHERE e.organization_id=o.id LIMIT 20) q;
  preserved := '{}'::jsonb;
  FOREACH k IN ARRAY legacy_keys LOOP
   effective := NULL;
   FOR candidate IN SELECT value FROM jsonb_array_elements(source_rows) LOOP
    IF NULLIF(btrim(candidate.value->>k),'') IS NOT NULL THEN effective := candidate.value->k; EXIT; END IF;
   END LOOP;
   IF effective IS NOT NULL THEN preserved := preserved || jsonb_build_object(k,effective); END IF;
  END LOOP;
  -- 本番で稼働していた自動送信は前日9時。未使用だったUI値で運用を変えない。
  preserved := preserved || '{"reminder_enabled":true,"reminder_schedule":[{"days_before":1,"time":"09:00","enabled":true}]}'::jsonb;
  INSERT INTO public.operating_setting_overrides(organization_id,settings) VALUES(o.id,preserved)
  ON CONFLICT(organization_id,store_id,organization_scenario_id,schedule_event_id)
  DO UPDATE SET settings=EXCLUDED.settings || operating_setting_overrides.settings;

  FOR s IN SELECT id FROM public.stores WHERE organization_id=o.id LOOP
   SELECT to_jsonb(e) INTO existing FROM public.email_settings e WHERE e.organization_id=o.id AND e.store_id=s.id;
   preserved := '{}'::jsonb;
   FOREACH k IN ARRAY legacy_keys LOOP
    IF NULLIF(btrim(existing->>k),'') IS NOT NULL THEN CONTINUE; END IF;
    effective := NULL;
    FOR candidate IN SELECT value FROM jsonb_array_elements(source_rows) LOOP
     IF candidate.value->>'store_id' IS DISTINCT FROM s.id::text AND NULLIF(btrim(candidate.value->>k),'') IS NOT NULL THEN
      effective := candidate.value->k; EXIT;
     END IF;
    END LOOP;
    IF effective IS NOT NULL THEN preserved := preserved || jsonb_build_object(k,effective); END IF;
   END LOOP;
   preserved := preserved || '{"reminder_enabled":null,"reminder_schedule":null}'::jsonb;
   INSERT INTO public.operating_setting_overrides(organization_id,store_id,settings) VALUES(o.id,s.id,preserved)
   ON CONFLICT(organization_id,store_id,organization_scenario_id,schedule_event_id)
   DO UPDATE SET settings=EXCLUDED.settings || operating_setting_overrides.settings;
  END LOOP;
 END LOOP;
END;
$$;
-- 旧設定行のない店舗では予約時snapshotの期限が0だったため、その実効値を温存する。
-- 利用者が「共通に戻す」を選んだ時点で標準／組織共通の期限に切り替わる。
INSERT INTO public.operating_setting_overrides(organization_id,store_id,settings)
SELECT s.organization_id,s.id,'{"cancellation_deadline_hours":0,"private_cancellation_deadline_hours":0}'::jsonb
FROM public.stores s WHERE NOT EXISTS(SELECT 1 FROM public.reservation_settings r WHERE r.store_id=s.id)
ON CONFLICT(organization_id,store_id,organization_scenario_id,schedule_event_id)
DO UPDATE SET settings=EXCLUDED.settings || operating_setting_overrides.settings;

-- 仮の組織だけを使用。実予約・送信処理を呼ばず、全変更を取り消す。
BEGIN;
INSERT INTO public.organizations(id, name, slug) VALUES
 ('eeeeeeee-1000-4000-8000-000000000001', '設定階層検証A', 'qw-hierarchy-fixture-a'),
 ('eeeeeeee-1000-4000-8000-000000000002', '設定階層検証B', 'qw-hierarchy-fixture-b');
INSERT INTO public.scenario_masters(id, title, player_count_min, player_count_max)
 VALUES ('eeeeeeee-1000-4000-8000-000000000003', '設定階層検証', 4, 5);
INSERT INTO public.organization_scenarios(id, organization_id, scenario_master_id) VALUES
 ('eeeeeeee-1000-4000-8000-000000000004', 'eeeeeeee-1000-4000-8000-000000000002', 'eeeeeeee-1000-4000-8000-000000000003');
DO $$
DECLARE
 v_org uuid := 'eeeeeeee-1000-4000-8000-000000000001';
 v_revision bigint;
BEGIN
 ASSERT NOT has_table_privilege('anon', 'public.operating_setting_overrides', 'SELECT');
 ASSERT NOT has_table_privilege('authenticated', 'public.operating_setting_overrides', 'UPDATE');
 ASSERT NOT has_function_privilege('authenticated', 'public.save_operating_setting_overrides(uuid,text,uuid,jsonb,bigint)', 'EXECUTE');
 v_revision := public.save_operating_setting_overrides(v_org, 'organization', v_org, '{"reminder_enabled":false,"preparation_minutes":0}', 0);
 ASSERT v_revision = 1;
 v_revision := public.save_operating_setting_overrides(v_org, 'organization', v_org, '{"preparation_minutes":null}', 1);
 ASSERT v_revision = 2;
 ASSERT (SELECT settings = '{"reminder_enabled":false,"preparation_minutes":null}'::jsonb
   FROM public.operating_setting_overrides WHERE organization_id = v_org);
 BEGIN
   PERFORM public.save_operating_setting_overrides(v_org, 'organization', v_org, '{"reminder_enabled":true}', 1);
   RAISE EXCEPTION '古いrevisionで保存できてしまった';
 EXCEPTION WHEN serialization_failure THEN NULL;
 END;
 BEGIN
   PERFORM public.save_operating_setting_overrides(v_org, 'organization', v_org, '{}', 0);
   RAISE EXCEPTION '同一設定の重複作成ができてしまった';
 EXCEPTION WHEN serialization_failure THEN NULL;
 END;
 BEGIN
   PERFORM public.save_operating_setting_overrides(v_org, 'scenario', 'eeeeeeee-1000-4000-8000-000000000004', '{}', 0);
   RAISE EXCEPTION '別組織の作品を変更できてしまった';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
 BEGIN
   PERFORM public.save_operating_setting_overrides(v_org, 'organization', 'eeeeeeee-1000-4000-8000-000000000002', '{}', 0);
   RAISE EXCEPTION '別組織の共通設定を変更できてしまった';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
 ASSERT (SELECT settings->'reminder_enabled' = 'false'::jsonb FROM public.operating_setting_overrides WHERE organization_id = v_org);
END;
$$;
INSERT INTO public.stores(id, organization_id, name, short_name) VALUES
 ('eeeeeeee-1000-4000-8000-000000000005', 'eeeeeeee-1000-4000-8000-000000000001', '設定階層仮店舗', '仮');
INSERT INTO public.organization_scenarios(id, organization_id, scenario_master_id) VALUES
 ('eeeeeeee-1000-4000-8000-000000000006', 'eeeeeeee-1000-4000-8000-000000000001', 'eeeeeeee-1000-4000-8000-000000000003');
INSERT INTO public.reservation_settings(store_id, organization_id, payment_method_label) VALUES
 ('eeeeeeee-1000-4000-8000-000000000005', 'eeeeeeee-1000-4000-8000-000000000001', '旧店舗案内');
INSERT INTO public.schedule_events(id, organization_id, store_id, organization_scenario_id, date, start_time, end_time, venue, scenario) VALUES
 ('eeeeeeee-1000-4000-8000-000000000007', 'eeeeeeee-1000-4000-8000-000000000001', 'eeeeeeee-1000-4000-8000-000000000005', 'eeeeeeee-1000-4000-8000-000000000006', '2099-01-01', '10:00', '12:00', '仮店舗', '仮作品');
DO $$
DECLARE
 o uuid := 'eeeeeeee-1000-4000-8000-000000000001';
 s uuid := 'eeeeeeee-1000-4000-8000-000000000005';
 c uuid := 'eeeeeeee-1000-4000-8000-000000000006';
 e uuid := 'eeeeeeee-1000-4000-8000-000000000007';
BEGIN
 ASSERT NOT has_function_privilege('anon', 'public.resolve_operating_setting(uuid,text,jsonb,uuid,uuid,uuid)', 'EXECUTE');
 ASSERT public.resolve_operating_setting(o,'payment_method_label','"標準"',NULL,NULL,e) = '{"value":"旧店舗案内","source":"store"}'::jsonb;
 PERFORM public.save_operating_setting_overrides(o,'organization',o,'{"payment_method_label":"組織案内"}',2);
 ASSERT public.resolve_operating_setting(o,'payment_method_label','"標準"',NULL,NULL,e)->>'value' = '旧店舗案内';
 PERFORM public.save_operating_setting_overrides(o,'store',s,'{"payment_method_label":null}',0);
 ASSERT public.resolve_operating_setting(o,'payment_method_label','"標準"',NULL,NULL,e) = '{"value":"組織案内","source":"organization"}'::jsonb;
 PERFORM public.save_operating_setting_overrides(o,'scenario',c,'{"payment_method_label":"作品案内"}',0);
 PERFORM public.save_operating_setting_overrides(o,'performance',e,'{"payment_method_label":"公演案内"}',0);
 ASSERT public.resolve_operating_setting(o,'payment_method_label','"標準"',NULL,NULL,e)->>'value' = '公演案内';
 PERFORM public.save_operating_setting_overrides(o,'performance',e,'{"payment_method_label":null}',1);
 ASSERT public.resolve_operating_setting(o,'payment_method_label','"標準"',NULL,NULL,e)->>'value' = '作品案内';
 PERFORM public.save_operating_setting_overrides(o,'scenario',c,'{"payment_method_label":""}',1);
 ASSERT public.resolve_operating_setting(o,'payment_method_label','"標準"',NULL,NULL,e)->>'value' = '';
 BEGIN
   PERFORM public.resolve_operating_setting('eeeeeeee-1000-4000-8000-000000000002','payment_method_label','null',NULL,NULL,e);
   RAISE EXCEPTION '別組織の公演を参照できてしまった';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
 ASSERT NOT EXISTS(SELECT 1 FROM public.get_public_payment_settings('qw-hierarchy-fixture-b',e));
END;
$$;
-- 実予約テーブルには一切INSERTしない。通知トリガーのない一時表で条件固定だけ検証。
CREATE TEMP TABLE hierarchy_snapshot_fixture (LIKE public.reservations INCLUDING ALL);
CREATE TRIGGER hierarchy_snapshot_insert BEFORE INSERT ON hierarchy_snapshot_fixture
  FOR EACH ROW EXECUTE FUNCTION public.set_reservation_cancellation_policy_snapshot();
CREATE TRIGGER hierarchy_snapshot_update BEFORE UPDATE ON hierarchy_snapshot_fixture
  FOR EACH ROW EXECUTE FUNCTION public.set_reservation_cancellation_policy_snapshot();
SELECT public.save_operating_setting_overrides('eeeeeeee-1000-4000-8000-000000000001','scenario','eeeeeeee-1000-4000-8000-000000000006',
  '{"cancellation_deadline_hours":72,"cancellation_fees":[{"hours_before":72,"fee_percentage":25,"description":"仮規定"}]}',2);
INSERT INTO hierarchy_snapshot_fixture(id,organization_id,store_id,schedule_event_id,title,requested_datetime,duration,reservation_number)
VALUES ('eeeeeeee-1000-4000-8000-000000000008','eeeeeeee-1000-4000-8000-000000000001','eeeeeeee-1000-4000-8000-000000000005',
 'eeeeeeee-1000-4000-8000-000000000007','仮予約・通知なし','2099-01-01T10:00:00+09:00',120,'fixture-hierarchy-001');
SELECT public.save_operating_setting_overrides('eeeeeeee-1000-4000-8000-000000000001','scenario','eeeeeeee-1000-4000-8000-000000000006',
  '{"cancellation_deadline_hours":96}',3);
UPDATE hierarchy_snapshot_fixture SET title='条件維持検証';
UPDATE public.organizations SET is_active=true,booking_site_status='approved' WHERE id='eeeeeeee-1000-4000-8000-000000000001';
DO $$ BEGIN
 ASSERT (SELECT cancellation_policy_deadline_hours=72 AND cancellation_policy_fees->0->>'fee_percentage'='25' FROM hierarchy_snapshot_fixture);
 ASSERT (SELECT cancellation_deadline_hours=96 FROM public.get_public_cancellation_policy_for_context('qw-hierarchy-fixture-a',NULL,NULL,'eeeeeeee-1000-4000-8000-000000000007'));
 ASSERT (SELECT cancellation_deadline_hours=48 FROM public.get_public_cancellation_policy('qw-hierarchy-fixture-a','eeeeeeee-1000-4000-8000-000000000005'));
 ASSERT NOT EXISTS (SELECT 1 FROM public.get_public_cancellation_policy_for_context('qw-hierarchy-fixture-b',NULL,NULL,'eeeeeeee-1000-4000-8000-000000000007'));
END $$;
-- 共通復帰後のfallbackに旧店舗値が復活しない。
UPDATE public.reservation_settings SET cancellation_deadline_hours=72 WHERE store_id='eeeeeeee-1000-4000-8000-000000000005';
SELECT public.save_operating_setting_overrides('eeeeeeee-1000-4000-8000-000000000001','store','eeeeeeee-1000-4000-8000-000000000005','{"cancellation_deadline_hours":null}',1);
SELECT public.save_operating_setting_overrides('eeeeeeee-1000-4000-8000-000000000001','scenario','eeeeeeee-1000-4000-8000-000000000006','{"cancellation_deadline_hours":null}',4);
INSERT INTO hierarchy_snapshot_fixture(id,organization_id,store_id,schedule_event_id,title,requested_datetime,duration,reservation_number)
VALUES ('eeeeeeee-1000-4000-8000-000000000009','eeeeeeee-1000-4000-8000-000000000001','eeeeeeee-1000-4000-8000-000000000005',
 'eeeeeeee-1000-4000-8000-000000000007','共通復帰検証','2099-01-01T10:00:00+09:00',120,'fixture-hierarchy-002');
DO $$ BEGIN
 ASSERT (SELECT cancellation_policy_deadline_hours=48 FROM hierarchy_snapshot_fixture WHERE id='eeeeeeee-1000-4000-8000-000000000009');
 ASSERT (SELECT cancellation_deadline_hours=48 FROM public.get_public_cancellation_policy_for_context('qw-hierarchy-fixture-a',NULL,NULL,'eeeeeeee-1000-4000-8000-000000000007'));
 ASSERT (SELECT cancellation_policy_deadline_hours=72 FROM hierarchy_snapshot_fixture WHERE id='eeeeeeee-1000-4000-8000-000000000008');
END $$;
ROLLBACK;

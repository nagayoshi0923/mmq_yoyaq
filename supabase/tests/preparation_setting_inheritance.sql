-- operating_setting_overrides.sql の仮組織を使い、実予約RPCを実行せず判定境界を確認。
DO $$ DECLARE
 o uuid:='eeeeeeee-1000-4000-8000-000000000001';
 st uuid:='eeeeeeee-1000-4000-8000-000000000005';
 sc uuid:='eeeeeeee-1000-4000-8000-000000000006';
 sm uuid:='eeeeeeee-1000-4000-8000-000000000003';
 ev uuid:='eeeeeeee-1000-4000-8000-000000000007';
BEGIN
 UPDATE operating_setting_overrides SET settings=settings||'{"preparation_minutes":120}' WHERE organization_id=o AND store_id IS NULL AND organization_scenario_id IS NULL AND schedule_event_id IS NULL;
 UPDATE operating_setting_overrides SET settings=settings||'{"preparation_minutes":90}' WHERE organization_id=o AND store_id=st;
 UPDATE operating_setting_overrides SET settings=settings||'{"preparation_minutes":30}' WHERE organization_id=o AND organization_scenario_id=sc;
 ASSERT public.resolve_preparation_minutes(o,st,sc)=30;
 ASSERT public.resolve_preparation_minutes(o,st,sm)=30;
 UPDATE operating_setting_overrides SET settings=settings||'{"preparation_minutes":0}' WHERE organization_id=o AND schedule_event_id=ev;
 ASSERT public.resolve_preparation_minutes(o,NULL,NULL,ev)=0;
 UPDATE operating_setting_overrides SET settings=settings||'{"preparation_minutes":null}' WHERE organization_id=o AND schedule_event_id=ev;
 ASSERT public.resolve_preparation_minutes(o,NULL,NULL,ev)=30;
 UPDATE operating_setting_overrides SET settings=settings||'{"preparation_minutes":null}' WHERE organization_id=o AND organization_scenario_id=sc;
 ASSERT public.resolve_preparation_minutes(o,NULL,NULL,ev)=90;
 -- 開始・終了を日付付きで比較し、深夜の準備バッファを時刻の折り返しで誤判定しない。
 ASSERT timestamp '2099-01-01 23:30' < timestamp '2099-01-01 23:00' + make_interval(mins=>public.resolve_preparation_minutes(o,NULL,NULL,ev));
 BEGIN
  PERFORM public.resolve_preparation_minutes('eeeeeeee-1000-4000-8000-000000000002',NULL,NULL,ev);
  RAISE EXCEPTION '別組織の公演を参照できた';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;

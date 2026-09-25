-- 呼出先を一時表・一時関数に置き換えて所属と確定公演の選択を検証する。
INSERT INTO gs_groups VALUES('aaaaaaaa-1000-4000-8000-000000000001','aaaaaaaa-1000-4000-8000-000000000002','aaaaaaaa-1000-4000-8000-000000000003');
INSERT INTO gs_scenarios VALUES('aaaaaaaa-1000-4000-8000-000000000004','aaaaaaaa-1000-4000-8000-000000000002','aaaaaaaa-1000-4000-8000-000000000003','[]');
DO $$ DECLARE s jsonb; BEGIN
 s:=pg_temp.gs_settings('aaaaaaaa-1000-4000-8000-000000000002','aaaaaaaa-1000-4000-8000-000000000001');
 ASSERT s->>'survey_enabled'='false';
 ASSERT s->>'survey_deadline_days'='1';
 BEGIN
  PERFORM pg_temp.gs_settings('aaaaaaaa-1000-4000-8000-000000000009','aaaaaaaa-1000-4000-8000-000000000001');
  RAISE EXCEPTION '別組織のグループが読めた';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
INSERT INTO gs_events VALUES('aaaaaaaa-1000-4000-8000-000000000007','aaaaaaaa-1000-4000-8000-000000000002','2099-01-02',NULL,NULL,NULL,NULL);
INSERT INTO gs_reservations VALUES('aaaaaaaa-1000-4000-8000-000000000005','aaaaaaaa-1000-4000-8000-000000000001','aaaaaaaa-1000-4000-8000-000000000002','confirmed',now(),'aaaaaaaa-1000-4000-8000-000000000006','aaaaaaaa-1000-4000-8000-000000000007');
DO $$ DECLARE s jsonb; BEGIN
 s:=pg_temp.gs_settings('aaaaaaaa-1000-4000-8000-000000000002','aaaaaaaa-1000-4000-8000-000000000001');
 ASSERT s->>'survey_enabled'='true';
 ASSERT s->>'survey_deadline_days'='0', '0日前を継承値へ戻さない';
 ASSERT s->>'survey_url'='https://example.com/survey';
 UPDATE gs_reservations SET status='cancelled';
 s:=pg_temp.gs_settings('aaaaaaaa-1000-4000-8000-000000000002','aaaaaaaa-1000-4000-8000-000000000001');
 ASSERT s->>'survey_enabled'='false', '取消済み予約を適用対象にしない';
END $$;

DO $$ DECLARE s jsonb; BEGIN
 ASSERT public.parse_announced_survey_deadline('回答期限: 12月31日まで','2099-01-02')='2098-12-31 23:59:59.999+09'::timestamptz;
 ASSERT public.parse_announced_survey_deadline('回答期限: 2月30日まで','2099-03-02') IS NULL;
 UPDATE gs_reservations SET status='confirmed';
 INSERT INTO gs_messages VALUES(gen_random_uuid(),'aaaaaaaa-1000-4000-8000-000000000001','{"action":"survey_notice","message":"回答期限: 12月31日まで"}',now());
 s:=pg_temp.gs_freeze('aaaaaaaa-1000-4000-8000-000000000002','aaaaaaaa-1000-4000-8000-000000000001');
 ASSERT (s->>'survey_deadline_at')::timestamptz='2098-12-31 23:59:59.999+09'::timestamptz;
 UPDATE gs_events SET date='2099-01-05';
 DELETE FROM gs_messages;
 s:=pg_temp.gs_freeze('aaaaaaaa-1000-4000-8000-000000000002','aaaaaaaa-1000-4000-8000-000000000001');
 ASSERT (s->>'survey_deadline_at')::timestamptz='2098-12-31 23:59:59.999+09'::timestamptz, '再取得・再案内で固定した期限を動かさない';
 ASSERT (SELECT count(*)=1 FROM gs_deadlines);
END $$;

DO $$ DECLARE result jsonb; BEGIN
 result:=pg_temp.gs_batch('aaaaaaaa-1000-4000-8000-000000000002',ARRAY['aaaaaaaa-1000-4000-8000-000000000001'::uuid]);
 ASSERT result ? 'aaaaaaaa-1000-4000-8000-000000000001';
 ASSERT pg_temp.gs_batch('aaaaaaaa-1000-4000-8000-000000000002',ARRAY[]::uuid[])='{}'::jsonb;
 BEGIN
  PERFORM pg_temp.gs_batch('aaaaaaaa-1000-4000-8000-000000000009',ARRAY['aaaaaaaa-1000-4000-8000-000000000001'::uuid]);
  RAISE EXCEPTION 'batch exposed foreign group';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN
  PERFORM pg_temp.gs_batch('aaaaaaaa-1000-4000-8000-000000000002',array_fill('aaaaaaaa-1000-4000-8000-000000000001'::uuid,ARRAY[101]));
  RAISE EXCEPTION 'batch limit ignored';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;

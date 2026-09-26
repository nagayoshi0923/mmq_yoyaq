-- operating_setting_overrides / preparation_setting_inheritance の仮データを使う。
DO $$ DECLARE ctx jsonb; BEGIN
 ctx:=public.get_public_preparation_context('eeeeeeee-1000-4000-8000-000000000001','eeeeeeee-1000-4000-8000-000000000003','2099-01-01','2099-01-02');
 ASSERT ctx->'stores'->>'eeeeeeee-1000-4000-8000-000000000005'='90';
 ASSERT ctx->'events'->>'eeeeeeee-1000-4000-8000-000000000007'='90';
 ASSERT (SELECT count(*)=2 FROM jsonb_object_keys(ctx));
 ASSERT has_function_privilege('anon','public.get_public_preparation_context(uuid,uuid,date,date)','EXECUTE');
 BEGIN
  PERFORM public.get_public_preparation_context('eeeeeeee-1000-4000-8000-000000000002','eeeeeeee-1000-4000-8000-000000000006','2099-01-01','2099-01-02');
  RAISE EXCEPTION '別組織作品が参照できた';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN
  PERFORM public.get_public_preparation_context('eeeeeeee-1000-4000-8000-000000000001','eeeeeeee-1000-4000-8000-000000000003','2099-01-01','2100-01-02');
  RAISE EXCEPTION '過大な期間で取得できた';
 EXCEPTION WHEN SQLSTATE 'P0041' THEN NULL; END;
 UPDATE organizations SET booking_site_status='pending' WHERE id='eeeeeeee-1000-4000-8000-000000000001';
 BEGIN
  PERFORM public.get_public_preparation_context('eeeeeeee-1000-4000-8000-000000000001','eeeeeeee-1000-4000-8000-000000000003','2099-01-01','2099-01-02');
  RAISE EXCEPTION '未公開の準備情報が参照できた';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;

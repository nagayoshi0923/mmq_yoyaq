-- 同じ列を保証する二重のUNIQUEを整理。元の制約名と一意性を維持する。
BEGIN;
SET LOCAL lock_timeout = '5s';
LOCK TABLE public.business_hours_settings, public.gm_availability_responses IN ACCESS EXCLUSIVE MODE;
DO $$
DECLARE item record; retained pg_constraint; redundant pg_constraint;
BEGIN
  FOR item IN SELECT * FROM (VALUES
    ('business_hours_settings', 'business_hours_settings_store_id_key', 'business_hours_settings_store_id_unique'),
    ('gm_availability_responses', 'gm_availability_responses_reservation_id_staff_id_key', 'gm_availability_responses_reservation_staff_unique')
  ) AS entries(table_name, keep_name, drop_name)
  LOOP
    SELECT * INTO retained FROM pg_constraint WHERE conrelid = ('public.' || item.table_name)::regclass AND conname = item.keep_name;
    SELECT * INTO redundant FROM pg_constraint WHERE conrelid = ('public.' || item.table_name)::regclass AND conname = item.drop_name;
    IF retained.oid IS NULL OR redundant.oid IS NULL
      OR retained.contype <> 'u' OR redundant.contype <> 'u'
      OR pg_get_constraintdef(retained.oid) IS DISTINCT FROM pg_get_constraintdef(redundant.oid)
    THEN
      RAISE EXCEPTION '重複UNIQUEの定義が想定と異なります: %', item.table_name;
    END IF;
    -- CASCADEを使わず、未知の参照依存があれば全体をロールバックする。
    EXECUTE format('ALTER TABLE public.%I DROP CONSTRAINT %I', item.table_name, item.drop_name);
  END LOOP;
END $$;
NOTIFY pgrst, 'reload schema';
COMMIT;

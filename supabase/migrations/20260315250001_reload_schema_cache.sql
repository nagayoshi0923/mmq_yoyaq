-- スキーマキャッシュをリロード
SELECT pg_notify('pgrst', 'reload schema');

DO $$ 
BEGIN
  RAISE NOTICE '✅ スキーマキャッシュのリロードを要求しました';
END $$;

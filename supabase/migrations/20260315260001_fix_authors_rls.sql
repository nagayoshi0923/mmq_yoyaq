-- authors テーブルのRLSポリシーを確実に設定

-- 既存のポリシーを全て削除して再作成
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN (
    SELECT policyname
    FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'authors'
  )
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.authors', r.policyname);
    RAISE NOTICE 'Dropped policy: %', r.policyname;
  END LOOP;
END $$;

-- RLSを有効化（既に有効でも問題なし）
ALTER TABLE public.authors ENABLE ROW LEVEL SECURITY;

-- 認証済みユーザーは全て閲覧可能
CREATE POLICY "authors_select_authenticated"
  ON public.authors
  FOR SELECT
  TO authenticated
  USING (true);

-- 認証済みユーザーは挿入可能
CREATE POLICY "authors_insert_authenticated"
  ON public.authors
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- 認証済みユーザーは更新可能
CREATE POLICY "authors_update_authenticated"
  ON public.authors
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- 認証済みユーザーは削除可能
CREATE POLICY "authors_delete_authenticated"
  ON public.authors
  FOR DELETE
  TO authenticated
  USING (true);

-- スキーマキャッシュをリロード
SELECT pg_notify('pgrst', 'reload schema');

DO $$ 
BEGIN
  RAISE NOTICE '✅ authors テーブルのRLSポリシーを再設定しました';
END $$;

-- authors テーブルを作成（作者のメモ・メールアドレス管理用）
CREATE TABLE IF NOT EXISTS public.authors (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  email TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- インデックス
CREATE INDEX IF NOT EXISTS idx_authors_name ON public.authors(name);
CREATE INDEX IF NOT EXISTS idx_authors_email ON public.authors(email);

-- RLSを有効化
ALTER TABLE public.authors ENABLE ROW LEVEL SECURITY;

-- 認証済みユーザーは全て閲覧可能（共有マスタデータ）
DROP POLICY IF EXISTS "authors_select_authenticated" ON public.authors;
CREATE POLICY "authors_select_authenticated"
  ON public.authors
  FOR SELECT
  TO authenticated
  USING (true);

-- 認証済みユーザーは挿入可能
DROP POLICY IF EXISTS "authors_insert_authenticated" ON public.authors;
CREATE POLICY "authors_insert_authenticated"
  ON public.authors
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- 認証済みユーザーは更新可能
DROP POLICY IF EXISTS "authors_update_authenticated" ON public.authors;
CREATE POLICY "authors_update_authenticated"
  ON public.authors
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- 認証済みユーザーは削除可能
DROP POLICY IF EXISTS "authors_delete_authenticated" ON public.authors;
CREATE POLICY "authors_delete_authenticated"
  ON public.authors
  FOR DELETE
  TO authenticated
  USING (true);

-- updated_at を自動更新するトリガー
CREATE OR REPLACE FUNCTION public.update_authors_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_authors_updated_at_trigger ON public.authors;
CREATE TRIGGER update_authors_updated_at_trigger
  BEFORE UPDATE ON public.authors
  FOR EACH ROW
  EXECUTE FUNCTION public.update_authors_updated_at();

COMMENT ON TABLE public.authors IS '作者マスタテーブル（メモ・連絡先管理）';
COMMENT ON COLUMN public.authors.name IS '作者名（ユニーク）';
COMMENT ON COLUMN public.authors.email IS '連絡先メールアドレス';
COMMENT ON COLUMN public.authors.notes IS '管理者用メモ';

-- スキーマキャッシュをリロード
SELECT pg_notify('pgrst', 'reload schema');

DO $$ 
BEGIN
  RAISE NOTICE '✅ authors テーブルを作成しました';
END $$;

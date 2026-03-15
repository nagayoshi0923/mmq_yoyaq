-- =============================================================================
-- 20260315: customers テーブルに prefecture（都道府県）カラムを追加
-- =============================================================================
--
-- 目的:
-- - 新規登録時に都道府県を必須入力とする
-- - 不正防止・顧客分析のための情報収集
--
-- 既存ユーザーは NULL 許可（後からマイページで入力を促す）
-- =============================================================================

-- prefecture カラムを追加（NULL 許可）
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'customers'
      AND column_name = 'prefecture'
  ) THEN
    ALTER TABLE public.customers
      ADD COLUMN prefecture TEXT;
    
    COMMENT ON COLUMN public.customers.prefecture IS '都道府県（例: 東京都、大阪府、北海道）';
  END IF;
END $$;

-- インデックスを追加（分析用）
CREATE INDEX IF NOT EXISTS idx_customers_prefecture ON public.customers(prefecture);

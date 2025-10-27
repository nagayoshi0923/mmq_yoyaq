-- 雑収支管理テーブルを作成
-- 公演に含まれない収入・支出を管理

CREATE TABLE IF NOT EXISTS miscellaneous_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  date DATE NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('income', 'expense')),
  category TEXT NOT NULL,
  amount INTEGER NOT NULL CHECK (amount > 0),
  description TEXT,
  store_id UUID REFERENCES stores(id) ON DELETE SET NULL,
  scenario_id UUID REFERENCES scenarios(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- インデックスを作成
CREATE INDEX IF NOT EXISTS idx_miscellaneous_transactions_date ON miscellaneous_transactions(date);
CREATE INDEX IF NOT EXISTS idx_miscellaneous_transactions_type ON miscellaneous_transactions(type);
CREATE INDEX IF NOT EXISTS idx_miscellaneous_transactions_store_id ON miscellaneous_transactions(store_id);
CREATE INDEX IF NOT EXISTS idx_miscellaneous_transactions_scenario_id ON miscellaneous_transactions(scenario_id);

-- コメントを追加
COMMENT ON TABLE miscellaneous_transactions IS '雑収支管理テーブル（公演以外の収入・支出）';
COMMENT ON COLUMN miscellaneous_transactions.id IS 'トランザクションID';
COMMENT ON COLUMN miscellaneous_transactions.date IS '日付';
COMMENT ON COLUMN miscellaneous_transactions.type IS '種別（income: 収入, expense: 支出）';
COMMENT ON COLUMN miscellaneous_transactions.category IS 'カテゴリ（広告費、補助金、印刷費、小道具など）';
COMMENT ON COLUMN miscellaneous_transactions.amount IS '金額（円）';
COMMENT ON COLUMN miscellaneous_transactions.description IS '説明・メモ';
COMMENT ON COLUMN miscellaneous_transactions.store_id IS '関連店舗ID（NULLの場合は全社）';
COMMENT ON COLUMN miscellaneous_transactions.scenario_id IS '関連シナリオID（NULLの場合はシナリオなし）';
COMMENT ON COLUMN miscellaneous_transactions.created_at IS '作成日時';
COMMENT ON COLUMN miscellaneous_transactions.updated_at IS '更新日時';

-- RLS（Row Level Security）を有効化
ALTER TABLE miscellaneous_transactions ENABLE ROW LEVEL SECURITY;

-- ポリシーを作成（認証済みユーザーのみアクセス可能）
CREATE POLICY "Enable read access for authenticated users" ON miscellaneous_transactions
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Enable insert for authenticated users" ON miscellaneous_transactions
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Enable update for authenticated users" ON miscellaneous_transactions
  FOR UPDATE USING (auth.role() = 'authenticated');

CREATE POLICY "Enable delete for authenticated users" ON miscellaneous_transactions
  FOR DELETE USING (auth.role() = 'authenticated');

-- 確認クエリ
SELECT 
  table_name,
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_name = 'miscellaneous_transactions'
ORDER BY ordinal_position;


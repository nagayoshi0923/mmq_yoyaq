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
CREATE INDEX IF NOT EXISTS idx_miscellaneous_transactions_date 
  ON miscellaneous_transactions(date);

CREATE INDEX IF NOT EXISTS idx_miscellaneous_transactions_type 
  ON miscellaneous_transactions(type);

CREATE INDEX IF NOT EXISTS idx_miscellaneous_transactions_store_id 
  ON miscellaneous_transactions(store_id);

CREATE INDEX IF NOT EXISTS idx_miscellaneous_transactions_scenario_id 
  ON miscellaneous_transactions(scenario_id);

-- RLSを有効化
ALTER TABLE miscellaneous_transactions ENABLE ROW LEVEL SECURITY;

-- ポリシーを作成
CREATE POLICY "Enable read access for authenticated users" 
  ON miscellaneous_transactions
  FOR SELECT 
  USING (auth.role() = 'authenticated');

CREATE POLICY "Enable insert for authenticated users" 
  ON miscellaneous_transactions
  FOR INSERT 
  WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Enable update for authenticated users" 
  ON miscellaneous_transactions
  FOR UPDATE 
  USING (auth.role() = 'authenticated');

CREATE POLICY "Enable delete for authenticated users" 
  ON miscellaneous_transactions
  FOR DELETE 
  USING (auth.role() = 'authenticated');

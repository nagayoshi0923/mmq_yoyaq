-- miscellaneous_transactionsテーブルにscenario_idカラムを追加

-- カラムを追加
ALTER TABLE miscellaneous_transactions 
ADD COLUMN IF NOT EXISTS scenario_id UUID REFERENCES scenarios(id) ON DELETE SET NULL;

-- インデックスを作成
CREATE INDEX IF NOT EXISTS idx_miscellaneous_transactions_scenario_id 
  ON miscellaneous_transactions(scenario_id);

-- 確認
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'miscellaneous_transactions'
ORDER BY ordinal_position;


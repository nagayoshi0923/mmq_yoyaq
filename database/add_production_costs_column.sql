-- scenariosテーブルに production_costs カラムを追加
-- required_props は既に ARRAY 型で存在

-- production_costs カラムを追加（JSONB配列）
ALTER TABLE scenarios
ADD COLUMN IF NOT EXISTS production_costs JSONB DEFAULT '[]'::jsonb;

COMMENT ON COLUMN scenarios.production_costs IS 'シナリオの制作費（項目別）- 例: [{"item": "キット", "amount": 30000}]';

-- 既存レコードにデフォルト値を設定
UPDATE scenarios
SET production_costs = '[]'::jsonb
WHERE production_costs IS NULL;

-- 確認クエリ
SELECT 
  id,
  title,
  production_costs,
  required_props
FROM scenarios
LIMIT 5;

-- データ型確認
SELECT 
  column_name,
  data_type,
  is_nullable
FROM information_schema.columns
WHERE table_name = 'scenarios'
  AND column_name IN ('production_costs', 'required_props')
ORDER BY column_name;


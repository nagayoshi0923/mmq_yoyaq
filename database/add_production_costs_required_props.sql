-- scenariosテーブルに production_costs と required_props カラムを追加

-- production_costs カラムを追加（JSONB配列）
ALTER TABLE scenarios
ADD COLUMN IF NOT EXISTS production_costs JSONB DEFAULT '[]'::jsonb;

COMMENT ON COLUMN scenarios.production_costs IS 'シナリオの制作費（項目別）';

-- required_props カラムを追加（JSONB配列）
ALTER TABLE scenarios
ADD COLUMN IF NOT EXISTS required_props JSONB DEFAULT '[]'::jsonb;

COMMENT ON COLUMN scenarios.required_props IS 'シナリオに必要な小道具（項目別）';

-- 既存レコードにデフォルト値を設定
UPDATE scenarios
SET production_costs = '[]'::jsonb
WHERE production_costs IS NULL;

UPDATE scenarios
SET required_props = '[]'::jsonb
WHERE required_props IS NULL;

-- 確認クエリ
SELECT 
  id,
  title,
  production_costs,
  required_props
FROM scenarios
LIMIT 5;

-- データ構造の例
/*
production_costs: [
  { "item": "キット", "amount": 30000 },
  { "item": "印刷費", "amount": 5000 }
]

required_props: [
  { "item": "プレイヤーシート", "amount": 10, "frequency": "recurring" },
  { "item": "特殊アイテム", "amount": 1, "frequency": "one-time" }
]
*/


-- required_props を ARRAY 型から JSONB 型に変更
-- これにより production_costs と同じ型で統一

-- ステップ1: 一時カラムを作成
ALTER TABLE scenarios
ADD COLUMN IF NOT EXISTS required_props_jsonb JSONB;

-- ステップ2: 既存データを JSONB 形式に変換
-- ARRAY型の場合、to_jsonb() で変換可能
UPDATE scenarios
SET required_props_jsonb = COALESCE(to_jsonb(required_props), '[]'::jsonb)
WHERE required_props IS NOT NULL;

-- NULLの場合は空配列
UPDATE scenarios
SET required_props_jsonb = '[]'::jsonb
WHERE required_props IS NULL;

-- ステップ3: 古いカラムを削除
ALTER TABLE scenarios
DROP COLUMN IF EXISTS required_props;

-- ステップ4: 新しいカラムをリネーム
ALTER TABLE scenarios
RENAME COLUMN required_props_jsonb TO required_props;

-- コメント追加
COMMENT ON COLUMN scenarios.required_props IS 'シナリオに必要な小道具（項目別）- 例: [{"item": "シート", "amount": 10, "frequency": "recurring"}]';

-- 確認クエリ
SELECT 
  id,
  title,
  required_props,
  pg_typeof(required_props) as required_props_type
FROM scenarios
LIMIT 5;

-- データ型確認
SELECT 
  column_name,
  data_type,
  is_nullable
FROM information_schema.columns
WHERE table_name = 'scenarios'
  AND column_name = 'required_props';


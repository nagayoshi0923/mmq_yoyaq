-- 店舗に固定費（家賃・光熱費など）を設定できるようにする

-- storesテーブルに固定費カラムを追加
ALTER TABLE stores
ADD COLUMN IF NOT EXISTS fixed_costs JSONB DEFAULT '[]'::jsonb;

COMMENT ON COLUMN stores.fixed_costs IS '店舗の固定費（家賃、光熱費など）';

-- データ形式:
-- [
--   {
--     "item": "家賃",
--     "amount": 150000,
--     "frequency": "monthly",
--     "notes": "毎月末払い"
--   },
--   {
--     "item": "光熱費",
--     "amount": 30000,
--     "frequency": "monthly",
--     "notes": ""
--   }
-- ]

-- 設定例: 本店の固定費を設定
UPDATE stores
SET fixed_costs = jsonb_build_array(
  jsonb_build_object(
    'item', '家賃',
    'amount', 150000,
    'frequency', 'monthly',
    'notes', '毎月末払い'
  ),
  jsonb_build_object(
    'item', '光熱費',
    'amount', 30000,
    'frequency', 'monthly',
    'notes', '電気・ガス・水道'
  ),
  jsonb_build_object(
    'item', '通信費',
    'amount', 15000,
    'frequency', 'monthly',
    'notes', 'インターネット・電話'
  )
)
WHERE name = '本店';

-- 確認
SELECT 
  name,
  short_name,
  jsonb_pretty(fixed_costs) as 固定費
FROM stores
WHERE fixed_costs IS NOT NULL 
  AND jsonb_array_length(fixed_costs) > 0;

-- 全店舗の固定費合計を計算
SELECT 
  name,
  short_name,
  (
    SELECT COALESCE(SUM((cost->>'amount')::int), 0)
    FROM jsonb_array_elements(fixed_costs) AS cost
  ) as 月額固定費合計
FROM stores
ORDER BY name;


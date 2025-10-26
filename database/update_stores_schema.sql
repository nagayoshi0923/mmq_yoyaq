-- storesテーブルのスキーマを最新の Store 型定義に合わせて更新

-- 1. fixed_costs カラムを追加（店舗の固定費）
ALTER TABLE stores
ADD COLUMN IF NOT EXISTS fixed_costs JSONB DEFAULT '[]'::jsonb;

COMMENT ON COLUMN stores.fixed_costs IS '店舗の固定費（家賃、光熱費など）。JSONB配列形式';

-- 2. ownership_type カラムを追加（直営店/フランチャイズ）
ALTER TABLE stores
ADD COLUMN IF NOT EXISTS ownership_type TEXT CHECK (ownership_type IN ('corporate', 'franchise'));

COMMENT ON COLUMN stores.ownership_type IS '店舗タイプ: corporate（直営店）, franchise（フランチャイズ）';

-- 既存の店舗にデフォルト値を設定
UPDATE stores
SET fixed_costs = '[]'::jsonb
WHERE fixed_costs IS NULL;

UPDATE stores
SET ownership_type = 'corporate'
WHERE ownership_type IS NULL;

-- 確認クエリ
SELECT 
  name,
  short_name,
  CASE 
    WHEN ownership_type = 'corporate' THEN '直営店'
    WHEN ownership_type = 'franchise' THEN 'フランチャイズ'
    ELSE '未設定'
  END as 店舗タイプ,
  CASE 
    WHEN fixed_costs IS NULL THEN 'NULL'
    WHEN jsonb_array_length(fixed_costs) = 0 THEN '固定費なし'
    ELSE jsonb_array_length(fixed_costs)::text || '件の固定費'
  END as 固定費設定状況,
  status
FROM stores
ORDER BY name;

-- 固定費の設定例（コメントアウト）
/*
-- 例1: 高田馬場店に家賃と光熱費を設定
UPDATE stores
SET fixed_costs = jsonb_build_array(
  jsonb_build_object(
    'item', '家賃',
    'amount', 150000,
    'frequency', 'monthly',
    'startDate', '2024-01-01',
    'status', 'active',
    'notes', '毎月末払い'
  ),
  jsonb_build_object(
    'item', '光熱費',
    'amount', 30000,
    'frequency', 'monthly',
    'startDate', '2024-01-01',
    'status', 'active',
    'notes', '電気・ガス・水道'
  )
)
WHERE name = '高田馬場店';

-- 例2: 特定店舗をフランチャイズに変更
UPDATE stores
SET ownership_type = 'franchise'
WHERE name = '埼玉大宮店';
*/

-- fixed_costs の構造例
/*
[
  {
    "item": "家賃",
    "amount": 150000,
    "frequency": "monthly",  // "monthly" | "yearly" | "one-time"
    "startDate": "2024-01-01",
    "endDate": "2025-12-31",  // オプション
    "status": "active",  // "active" | "legacy"
    "notes": "メモ"
  }
]
*/


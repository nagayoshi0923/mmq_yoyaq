-- シナリオ料金システム移行スクリプト
-- 既存データがほぼないため、クリーンな移行を実行
-- 注意：GM報酬にはroleフィールド（main/sub）が追加されました

-- 1. 新しいカラムを追加
ALTER TABLE scenarios 
ADD COLUMN IF NOT EXISTS gm_assignments JSONB DEFAULT '[]',
ADD COLUMN IF NOT EXISTS license_costs JSONB DEFAULT '[]',
ADD COLUMN IF NOT EXISTS participation_costs JSONB DEFAULT '[]';

-- 2. 既存データを新形式に移行
-- gm_feeが設定されているシナリオを新しいgm_assignments形式に変換
UPDATE scenarios 
SET gm_assignments = jsonb_build_array(
  jsonb_build_object(
    'role', 'main',
    'reward', COALESCE(gm_fee, 2000)
  )
)
WHERE gm_fee > 0 OR gm_fee IS NULL;

-- license_amountが設定されているシナリオを新形式に変換
UPDATE scenarios 
SET license_costs = jsonb_build_array(
  jsonb_build_object(
    'time_slot', '通常',
    'amount', license_amount,
    'type', 'fixed'
  )
)
WHERE license_amount > 0;

-- participation_feeが設定されているシナリオを新形式に変換
UPDATE scenarios 
SET participation_costs = jsonb_build_array(
  jsonb_build_object(
    'time_slot', '通常',
    'amount', participation_fee,
    'type', 'fixed'
  )
)
WHERE participation_fee > 0;

-- 3. 古いカラムを削除（既存データがほぼないため安全）
ALTER TABLE scenarios DROP COLUMN IF EXISTS gm_fee;
ALTER TABLE scenarios DROP COLUMN IF EXISTS license_amount;

-- 4. インデックス追加（パフォーマンス向上）
CREATE INDEX IF NOT EXISTS idx_scenarios_gm_assignments ON scenarios USING GIN (gm_assignments);
CREATE INDEX IF NOT EXISTS idx_scenarios_license_costs ON scenarios USING GIN (license_costs);
CREATE INDEX IF NOT EXISTS idx_scenarios_participation_costs ON scenarios USING GIN (participation_costs);

-- 5. 確認用クエリ（実行後に確認）
/*
SELECT 
  title,
  gm_assignments,
  license_costs,
  participation_costs
FROM scenarios 
WHERE jsonb_array_length(gm_assignments) > 0 OR jsonb_array_length(license_costs) > 0 OR jsonb_array_length(participation_costs) > 0
LIMIT 5;
*/

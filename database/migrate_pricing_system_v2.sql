-- シナリオ料金システム移行スクリプト v2
-- 既存カラムが存在しない場合の対応

-- 1. 新しいカラムを追加（既に存在する場合はスキップ）
ALTER TABLE scenarios 
ADD COLUMN IF NOT EXISTS gm_costs JSONB DEFAULT '[]',
ADD COLUMN IF NOT EXISTS license_costs JSONB DEFAULT '[]';

-- 2. インデックス追加（パフォーマンス向上）
CREATE INDEX IF NOT EXISTS idx_scenarios_gm_costs ON scenarios USING GIN (gm_costs);
CREATE INDEX IF NOT EXISTS idx_scenarios_license_costs ON scenarios USING GIN (license_costs);

-- 3. 確認用クエリ
SELECT 
  title,
  gm_costs,
  license_costs
FROM scenarios 
LIMIT 5;

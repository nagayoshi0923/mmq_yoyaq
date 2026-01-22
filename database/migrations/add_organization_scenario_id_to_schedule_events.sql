-- schedule_events に organization_scenario_id カラムを追加
-- 作成日: 2026-01-22
-- 概要: 公演を organization_scenarios に紐付けることで、新UIとの整合性を確保

-- ========================================
-- STEP 1: カラム追加（既に実行済みの場合はスキップ）
-- ========================================
-- ALTER TABLE schedule_events 
-- ADD COLUMN IF NOT EXISTS organization_scenario_id UUID REFERENCES organization_scenarios(id);

-- ========================================
-- STEP 2: 既存データのマイグレーション
-- scenarios → scenario_master_id → organization_scenarios を経由して設定
-- ========================================
UPDATE schedule_events se
SET organization_scenario_id = os.id
FROM scenarios s
JOIN organization_scenarios os 
  ON os.scenario_master_id = s.scenario_master_id 
  AND os.organization_id = se.organization_id
WHERE se.scenario_id = s.id
  AND s.scenario_master_id IS NOT NULL
  AND se.organization_scenario_id IS NULL;  -- 未設定のもののみ更新

-- ========================================
-- STEP 3: インデックス追加
-- ========================================
CREATE INDEX IF NOT EXISTS idx_schedule_events_org_scenario_id 
ON schedule_events(organization_scenario_id);

-- ========================================
-- STEP 4: マイグレーション結果の確認
-- ========================================
-- SELECT 
--   COUNT(*) as total,
--   COUNT(organization_scenario_id) as migrated,
--   COUNT(scenario_id) as has_scenario_id,
--   COUNT(*) - COUNT(organization_scenario_id) as not_migrated
-- FROM schedule_events
-- WHERE scenario_id IS NOT NULL;

-- ========================================
-- 補足: PostgREST スキーマキャッシュのリロード
-- ========================================
-- 新しいカラムを API から参照するには、以下を実行してください:
-- SELECT pg_notify('pgrst', 'reload schema');


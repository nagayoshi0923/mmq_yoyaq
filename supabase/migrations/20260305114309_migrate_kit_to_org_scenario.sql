-- キット管理テーブルを organization_scenarios 参照に移行
-- 作成日: 2026-03-05
-- 概要: scenario_kit_locations, kit_transfer_events, kit_transfer_completions を
--       scenario_id (旧scenarios) から org_scenario_id (organization_scenarios) に移行

-- ============================================================
-- 1. scenario_kit_locations: org_scenario_id カラム追加とデータ移行
-- ============================================================

-- org_scenario_id カラムを追加
ALTER TABLE scenario_kit_locations 
  ADD COLUMN IF NOT EXISTS org_scenario_id UUID REFERENCES organization_scenarios(id) ON DELETE CASCADE;

-- 既存データを移行: scenarios.id → organization_scenarios.id
-- scenarios と organization_scenarios は scenario_master_id + organization_id で紐付く
UPDATE scenario_kit_locations skl
SET org_scenario_id = os.id
FROM scenarios s
JOIN organization_scenarios os 
  ON os.scenario_master_id = s.scenario_master_id 
  AND os.organization_id = s.organization_id
WHERE skl.scenario_id = s.id
  AND skl.org_scenario_id IS NULL
  AND s.scenario_master_id IS NOT NULL;

-- scenario_master_id がない場合は title で紐付け
UPDATE scenario_kit_locations skl
SET org_scenario_id = os.id
FROM scenarios s
JOIN scenario_masters sm ON LOWER(TRIM(s.title)) = LOWER(TRIM(sm.title))
JOIN organization_scenarios os 
  ON os.scenario_master_id = sm.id 
  AND os.organization_id = s.organization_id
WHERE skl.scenario_id = s.id
  AND skl.org_scenario_id IS NULL;

-- インデックス追加
CREATE INDEX IF NOT EXISTS idx_scenario_kit_locations_org_scenario 
  ON scenario_kit_locations(org_scenario_id);

-- 移行結果確認
DO $$
DECLARE
  total_count INTEGER;
  migrated_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO total_count FROM scenario_kit_locations;
  SELECT COUNT(*) INTO migrated_count FROM scenario_kit_locations WHERE org_scenario_id IS NOT NULL;
  RAISE NOTICE 'scenario_kit_locations: %/% 件 移行完了', migrated_count, total_count;
END $$;

-- ============================================================
-- 2. kit_transfer_events: org_scenario_id カラム追加とデータ移行
-- ============================================================

ALTER TABLE kit_transfer_events 
  ADD COLUMN IF NOT EXISTS org_scenario_id UUID REFERENCES organization_scenarios(id) ON DELETE CASCADE;

UPDATE kit_transfer_events kte
SET org_scenario_id = os.id
FROM scenarios s
JOIN organization_scenarios os 
  ON os.scenario_master_id = s.scenario_master_id 
  AND os.organization_id = s.organization_id
WHERE kte.scenario_id = s.id
  AND kte.org_scenario_id IS NULL
  AND s.scenario_master_id IS NOT NULL;

UPDATE kit_transfer_events kte
SET org_scenario_id = os.id
FROM scenarios s
JOIN scenario_masters sm ON LOWER(TRIM(s.title)) = LOWER(TRIM(sm.title))
JOIN organization_scenarios os 
  ON os.scenario_master_id = sm.id 
  AND os.organization_id = s.organization_id
WHERE kte.scenario_id = s.id
  AND kte.org_scenario_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_kit_transfer_events_org_scenario 
  ON kit_transfer_events(org_scenario_id);

DO $$
DECLARE
  total_count INTEGER;
  migrated_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO total_count FROM kit_transfer_events;
  SELECT COUNT(*) INTO migrated_count FROM kit_transfer_events WHERE org_scenario_id IS NOT NULL;
  RAISE NOTICE 'kit_transfer_events: %/% 件 移行完了', migrated_count, total_count;
END $$;

-- ============================================================
-- 3. kit_transfer_completions: org_scenario_id カラム追加とデータ移行
-- ============================================================

ALTER TABLE kit_transfer_completions 
  ADD COLUMN IF NOT EXISTS org_scenario_id UUID REFERENCES organization_scenarios(id) ON DELETE CASCADE;

UPDATE kit_transfer_completions ktc
SET org_scenario_id = os.id
FROM scenarios s
JOIN organization_scenarios os 
  ON os.scenario_master_id = s.scenario_master_id 
  AND os.organization_id = s.organization_id
WHERE ktc.scenario_id = s.id
  AND ktc.org_scenario_id IS NULL
  AND s.scenario_master_id IS NOT NULL;

UPDATE kit_transfer_completions ktc
SET org_scenario_id = os.id
FROM scenarios s
JOIN scenario_masters sm ON LOWER(TRIM(s.title)) = LOWER(TRIM(sm.title))
JOIN organization_scenarios os 
  ON os.scenario_master_id = sm.id 
  AND os.organization_id = s.organization_id
WHERE ktc.scenario_id = s.id
  AND ktc.org_scenario_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_kit_transfer_completions_org_scenario 
  ON kit_transfer_completions(org_scenario_id);

DO $$
DECLARE
  total_count INTEGER;
  migrated_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO total_count FROM kit_transfer_completions;
  SELECT COUNT(*) INTO migrated_count FROM kit_transfer_completions WHERE org_scenario_id IS NOT NULL;
  RAISE NOTICE 'kit_transfer_completions: %/% 件 移行完了', migrated_count, total_count;
END $$;

-- ============================================================
-- 4. 新しいユニーク制約を追加（org_scenario_id ベース）
-- ============================================================

-- 既存の制約を維持しつつ、新しい制約を追加
-- scenario_kit_locations: org + org_scenario_id + kit_number がユニーク
ALTER TABLE scenario_kit_locations
  DROP CONSTRAINT IF EXISTS scenario_kit_locations_org_scenario_unique;

ALTER TABLE scenario_kit_locations
  ADD CONSTRAINT scenario_kit_locations_org_scenario_unique 
  UNIQUE (organization_id, org_scenario_id, kit_number);

-- kit_transfer_completions の制約更新
ALTER TABLE kit_transfer_completions
  DROP CONSTRAINT IF EXISTS kit_transfer_completions_org_scenario_unique;

-- ============================================================
-- 5. コメント追加
-- ============================================================

COMMENT ON COLUMN scenario_kit_locations.org_scenario_id IS 
  '組織シナリオID（organization_scenarios.id）。組織ごとのキット管理に使用';

COMMENT ON COLUMN kit_transfer_events.org_scenario_id IS 
  '組織シナリオID（organization_scenarios.id）。組織ごとのキット移動に使用';

COMMENT ON COLUMN kit_transfer_completions.org_scenario_id IS 
  '組織シナリオID（organization_scenarios.id）。組織ごとのキット移動完了記録に使用';

-- Phase 3: scenario_id → scenario_master_id リネーム
-- 対象テーブル:
--   1. external_performance_reports: scenario_id カラム削除（scenario_master_id は追加済み）
--   2. scenario_kit_locations: scenario_id → scenario_master_id リネーム
--   3. kit_transfer_events: scenario_id → scenario_master_id リネーム
--   4. kit_transfer_completions: scenario_id → scenario_master_id リネーム
--
-- 作成日: 2026-04-13
-- 注意: この変更は本番環境に影響するため、ステージングで十分にテストすること

-- ============================================================
-- 1. external_performance_reports: scenario_id カラムを削除
--    scenario_master_id は 20260302140000 で追加済み
-- ============================================================

-- まず scenario_id を参照している外部キーを削除
ALTER TABLE external_performance_reports
  DROP CONSTRAINT IF EXISTS external_performance_reports_scenario_id_fkey;

-- インデックスを削除
DROP INDEX IF EXISTS idx_external_performance_reports_scenario;

-- scenario_id カラムを削除
ALTER TABLE external_performance_reports
  DROP COLUMN IF EXISTS scenario_id;

-- scenario_master_id のインデックスを追加（なければ）
CREATE INDEX IF NOT EXISTS idx_external_performance_reports_scenario_master
  ON external_performance_reports(scenario_master_id);

DO $$
BEGIN
  RAISE NOTICE '✅ external_performance_reports: scenario_id カラムを削除しました';
END $$;

-- ============================================================
-- 2. scenario_kit_locations: scenario_id → scenario_master_id
-- ============================================================

-- 既存の scenario_id FK を削除
ALTER TABLE scenario_kit_locations
  DROP CONSTRAINT IF EXISTS scenario_kit_locations_scenario_id_fkey;

-- scenario_id を参照するユニーク制約を削除
ALTER TABLE scenario_kit_locations
  DROP CONSTRAINT IF EXISTS scenario_kit_locations_organization_id_scenario_id_kit_numbe_key;

-- scenario_id インデックスを削除
DROP INDEX IF EXISTS idx_scenario_kit_locations_scenario;

-- カラムをリネーム
ALTER TABLE scenario_kit_locations
  RENAME COLUMN scenario_id TO scenario_master_id;

-- scenario_masters への FK を追加（SET NULL で緩やかに）
ALTER TABLE scenario_kit_locations
  ADD CONSTRAINT scenario_kit_locations_scenario_master_id_fkey
  FOREIGN KEY (scenario_master_id) REFERENCES scenario_masters(id) ON DELETE SET NULL;

-- 新しいインデックスを追加
CREATE INDEX IF NOT EXISTS idx_scenario_kit_locations_scenario_master
  ON scenario_kit_locations(scenario_master_id);

-- 新しいユニーク制約を追加（org_scenario_id ベースの制約は既存）
-- scenario_master_id + organization_id + kit_number の組み合わせは一意ではない可能性があるため追加しない

DO $$
BEGIN
  RAISE NOTICE '✅ scenario_kit_locations: scenario_id → scenario_master_id にリネームしました';
END $$;

-- ============================================================
-- 3. kit_transfer_events: scenario_id → scenario_master_id
-- ============================================================

-- 既存の FK を削除
ALTER TABLE kit_transfer_events
  DROP CONSTRAINT IF EXISTS kit_transfer_events_scenario_id_fkey;

-- インデックスを削除
DROP INDEX IF EXISTS idx_kit_transfer_events_scenario;

-- カラムをリネーム
ALTER TABLE kit_transfer_events
  RENAME COLUMN scenario_id TO scenario_master_id;

-- scenario_masters への FK を追加
ALTER TABLE kit_transfer_events
  ADD CONSTRAINT kit_transfer_events_scenario_master_id_fkey
  FOREIGN KEY (scenario_master_id) REFERENCES scenario_masters(id) ON DELETE SET NULL;

-- 新しいインデックスを追加
CREATE INDEX IF NOT EXISTS idx_kit_transfer_events_scenario_master
  ON kit_transfer_events(scenario_master_id);

DO $$
BEGIN
  RAISE NOTICE '✅ kit_transfer_events: scenario_id → scenario_master_id にリネームしました';
END $$;

-- ============================================================
-- 4. kit_transfer_completions: scenario_id → scenario_master_id
-- ============================================================

-- 既存の FK を削除
ALTER TABLE kit_transfer_completions
  DROP CONSTRAINT IF EXISTS kit_transfer_completions_scenario_id_fkey;

-- インデックスを削除（存在すれば）
DROP INDEX IF EXISTS idx_kit_transfer_completions_scenario;

-- カラムをリネーム
ALTER TABLE kit_transfer_completions
  RENAME COLUMN scenario_id TO scenario_master_id;

-- scenario_masters への FK を追加
ALTER TABLE kit_transfer_completions
  ADD CONSTRAINT kit_transfer_completions_scenario_master_id_fkey
  FOREIGN KEY (scenario_master_id) REFERENCES scenario_masters(id) ON DELETE SET NULL;

-- 新しいインデックスを追加
CREATE INDEX IF NOT EXISTS idx_kit_transfer_completions_scenario_master
  ON kit_transfer_completions(scenario_master_id);

DO $$
BEGIN
  RAISE NOTICE '✅ kit_transfer_completions: scenario_id → scenario_master_id にリネームしました';
END $$;

-- ============================================================
-- 5. コメント更新
-- ============================================================

COMMENT ON COLUMN scenario_kit_locations.scenario_master_id IS 
  'シナリオマスターID（scenario_masters.id）';

COMMENT ON COLUMN kit_transfer_events.scenario_master_id IS 
  'シナリオマスターID（scenario_masters.id）';

COMMENT ON COLUMN kit_transfer_completions.scenario_master_id IS 
  'シナリオマスターID（scenario_masters.id）';

-- ============================================================
-- 完了メッセージ
-- ============================================================

DO $$
BEGIN
  RAISE NOTICE '========================================';
  RAISE NOTICE 'Phase 3 scenario_id → scenario_master_id リネーム完了';
  RAISE NOTICE '  - external_performance_reports: scenario_id 削除';
  RAISE NOTICE '  - scenario_kit_locations: リネーム完了';
  RAISE NOTICE '  - kit_transfer_events: リネーム完了';
  RAISE NOTICE '  - kit_transfer_completions: リネーム完了';
  RAISE NOTICE '========================================';
END $$;

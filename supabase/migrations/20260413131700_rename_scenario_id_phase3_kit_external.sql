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

-- license_performance_summary ビューが scenario_id に依存しているため、先に削除
DROP VIEW IF EXISTS license_performance_summary CASCADE;

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

-- license_performance_summary ビューを再作成（scenario_master_id を使用）
CREATE OR REPLACE VIEW license_performance_summary AS
SELECT
  sm.id AS scenario_master_id,
  sm.title AS scenario_title,
  sm.author,
  COALESCE(os.license_amount, 0) AS license_amount,
  COUNT(DISTINCT CASE WHEN se.category IN ('open', 'private', 'gmtest') THEN se.id END) AS internal_performance_count,
  COALESCE(SUM(CASE WHEN epr.status = 'approved' THEN epr.performance_count ELSE 0 END), 0)::INTEGER AS external_performance_count,
  COUNT(DISTINCT CASE WHEN se.category IN ('open', 'private', 'gmtest') THEN se.id END) + 
    COALESCE(SUM(CASE WHEN epr.status = 'approved' THEN epr.performance_count ELSE 0 END), 0)::INTEGER AS total_performance_count,
  (COUNT(DISTINCT CASE WHEN se.category IN ('open', 'private', 'gmtest') THEN se.id END) + 
    COALESCE(SUM(CASE WHEN epr.status = 'approved' THEN epr.performance_count ELSE 0 END), 0)::INTEGER) * 
    COALESCE(os.license_amount, 0) AS total_license_fee
FROM scenario_masters sm
LEFT JOIN organization_scenarios os ON os.scenario_master_id = sm.id
LEFT JOIN schedule_events se ON se.scenario_master_id = sm.id AND se.is_cancelled = false
LEFT JOIN external_performance_reports epr ON epr.scenario_master_id = sm.id
GROUP BY sm.id, sm.title, sm.author, os.license_amount;

DO $$
BEGIN
  RAISE NOTICE '✅ external_performance_reports: scenario_id カラムを削除し、license_performance_summary ビューを再作成しました';
END $$;

-- ============================================================
-- 2. scenario_kit_locations: scenario_id カラム削除（scenario_master_id は追加済み）
-- ============================================================

-- 既存の scenario_id FK を削除
ALTER TABLE scenario_kit_locations
  DROP CONSTRAINT IF EXISTS scenario_kit_locations_scenario_id_fkey;

-- scenario_id を参照するユニーク制約を削除
ALTER TABLE scenario_kit_locations
  DROP CONSTRAINT IF EXISTS scenario_kit_locations_organization_id_scenario_id_kit_numbe_key;

-- scenario_id インデックスを削除
DROP INDEX IF EXISTS idx_scenario_kit_locations_scenario;

-- scenario_id カラムを削除（scenario_master_id は 20260302140000 で追加済み）
ALTER TABLE scenario_kit_locations
  DROP COLUMN IF EXISTS scenario_id;

-- scenario_master_id のインデックスを追加（なければ）
CREATE INDEX IF NOT EXISTS idx_scenario_kit_locations_scenario_master
  ON scenario_kit_locations(scenario_master_id);

DO $$
BEGIN
  RAISE NOTICE '✅ scenario_kit_locations: scenario_id カラムを削除しました';
END $$;

-- ============================================================
-- 3. kit_transfer_events: scenario_id → scenario_master_id
-- ============================================================

-- 既存の FK を削除
ALTER TABLE kit_transfer_events
  DROP CONSTRAINT IF EXISTS kit_transfer_events_scenario_id_fkey;

-- インデックスを削除
DROP INDEX IF EXISTS idx_kit_transfer_events_scenario;

-- scenario_id → scenario_master_id に値を変換（scenarios.id → scenarios.scenario_master_id）
UPDATE kit_transfer_events kte
SET scenario_id = s.scenario_master_id
FROM scenarios s
WHERE kte.scenario_id = s.id
  AND s.scenario_master_id IS NOT NULL;

-- カラムをリネーム
ALTER TABLE kit_transfer_events
  RENAME COLUMN scenario_id TO scenario_master_id;

-- scenario_masters に存在しないIDをNULLに
UPDATE kit_transfer_events kte
SET scenario_master_id = NULL
WHERE NOT EXISTS (
  SELECT 1 FROM scenario_masters sm WHERE sm.id = kte.scenario_master_id
);

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

-- scenario_id → scenario_master_id に値を変換（scenarios.id → scenarios.scenario_master_id）
UPDATE kit_transfer_completions ktc
SET scenario_id = s.scenario_master_id
FROM scenarios s
WHERE ktc.scenario_id = s.id
  AND s.scenario_master_id IS NOT NULL;

-- カラムをリネーム
ALTER TABLE kit_transfer_completions
  RENAME COLUMN scenario_id TO scenario_master_id;

-- scenario_masters に存在しないIDをNULLに
UPDATE kit_transfer_completions ktc
SET scenario_master_id = NULL
WHERE NOT EXISTS (
  SELECT 1 FROM scenario_masters sm WHERE sm.id = ktc.scenario_master_id
);

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

-- scenarios テーブル廃止に向けた移行 Step 1
-- 作成日: 2026-03-02
-- 概要: 外部キー参照を scenarios.id から scenario_masters.id (via scenario_master_id) に変更

-- ============================================================
-- 1. 事前確認: scenario_master_id が設定されていないシナリオを確認
-- ============================================================

DO $$
DECLARE
  missing_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO missing_count
  FROM scenarios
  WHERE scenario_master_id IS NULL
    AND organization_id = 'a0000000-0000-0000-0000-000000000001';
  
  IF missing_count > 0 THEN
    RAISE WARNING 'scenario_master_id が NULL のシナリオが %件 あります。先にマスタとの紐付けが必要です。', missing_count;
  ELSE
    RAISE NOTICE '✅ 全てのシナリオに scenario_master_id が設定されています';
  END IF;
END $$;

-- ============================================================
-- 2. schedule_events: scenario_id → scenario_master_id の移行
-- ============================================================

-- 2a. scenario_master_id カラムを追加（まだない場合）
ALTER TABLE schedule_events 
  ADD COLUMN IF NOT EXISTS scenario_master_id UUID REFERENCES scenario_masters(id) ON DELETE SET NULL;

-- 2b. 既存データを移行: scenarios.scenario_master_id を schedule_events.scenario_master_id にコピー
UPDATE schedule_events se
SET scenario_master_id = s.scenario_master_id
FROM scenarios s
WHERE se.scenario_id = s.id
  AND se.scenario_master_id IS NULL
  AND s.scenario_master_id IS NOT NULL;

-- 2c. 移行結果を確認
DO $$
DECLARE
  migrated_count INTEGER;
  remaining_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO migrated_count
  FROM schedule_events
  WHERE scenario_master_id IS NOT NULL;
  
  SELECT COUNT(*) INTO remaining_count
  FROM schedule_events
  WHERE scenario_id IS NOT NULL AND scenario_master_id IS NULL;
  
  RAISE NOTICE 'schedule_events: %件 移行完了、%件 未移行', migrated_count, remaining_count;
END $$;

-- ============================================================
-- 3. reservations: scenario_id → scenario_master_id の移行
-- ============================================================

-- 3a. scenario_master_id カラムを追加（まだない場合）
ALTER TABLE reservations 
  ADD COLUMN IF NOT EXISTS scenario_master_id UUID REFERENCES scenario_masters(id) ON DELETE SET NULL;

-- 3b. 既存データを移行
UPDATE reservations r
SET scenario_master_id = s.scenario_master_id
FROM scenarios s
WHERE r.scenario_id = s.id
  AND r.scenario_master_id IS NULL
  AND s.scenario_master_id IS NOT NULL;

-- 3c. 移行結果を確認
DO $$
DECLARE
  migrated_count INTEGER;
  remaining_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO migrated_count
  FROM reservations
  WHERE scenario_master_id IS NOT NULL;
  
  SELECT COUNT(*) INTO remaining_count
  FROM reservations
  WHERE scenario_id IS NOT NULL AND scenario_master_id IS NULL;
  
  RAISE NOTICE 'reservations: %件 移行完了、%件 未移行', migrated_count, remaining_count;
END $$;

-- ============================================================
-- 4. scenario_likes: scenario_id → scenario_master_id の移行
-- ============================================================

ALTER TABLE scenario_likes 
  ADD COLUMN IF NOT EXISTS scenario_master_id UUID REFERENCES scenario_masters(id) ON DELETE CASCADE;

UPDATE scenario_likes sl
SET scenario_master_id = s.scenario_master_id
FROM scenarios s
WHERE sl.scenario_id = s.id
  AND sl.scenario_master_id IS NULL
  AND s.scenario_master_id IS NOT NULL;

DO $$
DECLARE
  migrated_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO migrated_count
  FROM scenario_likes
  WHERE scenario_master_id IS NOT NULL;
  
  RAISE NOTICE 'scenario_likes: %件 移行完了', migrated_count;
END $$;

-- ============================================================
-- 5. manual_play_history: scenario_id → scenario_master_id の移行
-- ============================================================

ALTER TABLE manual_play_history 
  ADD COLUMN IF NOT EXISTS scenario_master_id UUID REFERENCES scenario_masters(id) ON DELETE SET NULL;

UPDATE manual_play_history mph
SET scenario_master_id = s.scenario_master_id
FROM scenarios s
WHERE mph.scenario_id = s.id
  AND mph.scenario_master_id IS NULL
  AND s.scenario_master_id IS NOT NULL;

DO $$
DECLARE
  migrated_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO migrated_count
  FROM manual_play_history
  WHERE scenario_master_id IS NOT NULL;
  
  RAISE NOTICE 'manual_play_history: %件 移行完了', migrated_count;
END $$;

-- ============================================================
-- 6. external_performance_reports: scenario_id → scenario_master_id
-- ============================================================

ALTER TABLE external_performance_reports 
  ADD COLUMN IF NOT EXISTS scenario_master_id UUID REFERENCES scenario_masters(id) ON DELETE SET NULL;

UPDATE external_performance_reports epr
SET scenario_master_id = s.scenario_master_id
FROM scenarios s
WHERE epr.scenario_id = s.id
  AND epr.scenario_master_id IS NULL
  AND s.scenario_master_id IS NOT NULL;

DO $$
DECLARE
  migrated_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO migrated_count
  FROM external_performance_reports
  WHERE scenario_master_id IS NOT NULL;
  
  RAISE NOTICE 'external_performance_reports: %件 移行完了', migrated_count;
END $$;

-- ============================================================
-- 7. miscellaneous_transactions: scenario_id → scenario_master_id
-- ============================================================

ALTER TABLE miscellaneous_transactions 
  ADD COLUMN IF NOT EXISTS scenario_master_id UUID REFERENCES scenario_masters(id) ON DELETE SET NULL;

UPDATE miscellaneous_transactions mt
SET scenario_master_id = s.scenario_master_id
FROM scenarios s
WHERE mt.scenario_id = s.id
  AND mt.scenario_master_id IS NULL
  AND s.scenario_master_id IS NOT NULL;

DO $$
DECLARE
  migrated_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO migrated_count
  FROM miscellaneous_transactions
  WHERE scenario_master_id IS NOT NULL;
  
  RAISE NOTICE 'miscellaneous_transactions: %件 移行完了', migrated_count;
END $$;

-- ============================================================
-- 8. performance_kits: scenario_id → scenario_master_id
-- ============================================================

ALTER TABLE performance_kits 
  ADD COLUMN IF NOT EXISTS scenario_master_id UUID REFERENCES scenario_masters(id) ON DELETE SET NULL;

UPDATE performance_kits pk
SET scenario_master_id = s.scenario_master_id
FROM scenarios s
WHERE pk.scenario_id = s.id
  AND pk.scenario_master_id IS NULL
  AND s.scenario_master_id IS NOT NULL;

DO $$
DECLARE
  migrated_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO migrated_count
  FROM performance_kits
  WHERE scenario_master_id IS NOT NULL;
  
  RAISE NOTICE 'performance_kits: %件 移行完了', migrated_count;
END $$;

-- ============================================================
-- 9. scenario_kit_locations: scenario_id → scenario_master_id
-- ============================================================

ALTER TABLE scenario_kit_locations 
  ADD COLUMN IF NOT EXISTS scenario_master_id UUID REFERENCES scenario_masters(id) ON DELETE CASCADE;

UPDATE scenario_kit_locations skl
SET scenario_master_id = s.scenario_master_id
FROM scenarios s
WHERE skl.scenario_id = s.id
  AND skl.scenario_master_id IS NULL
  AND s.scenario_master_id IS NOT NULL;

DO $$
DECLARE
  migrated_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO migrated_count
  FROM scenario_kit_locations
  WHERE scenario_master_id IS NOT NULL;
  
  RAISE NOTICE 'scenario_kit_locations: %件 移行完了', migrated_count;
END $$;

-- ============================================================
-- 10. インデックス追加
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_schedule_events_scenario_master_id 
  ON schedule_events(scenario_master_id);

CREATE INDEX IF NOT EXISTS idx_reservations_scenario_master_id 
  ON reservations(scenario_master_id);

CREATE INDEX IF NOT EXISTS idx_scenario_likes_scenario_master_id 
  ON scenario_likes(scenario_master_id);

-- ============================================================
-- 完了メッセージ
-- ============================================================

DO $$
BEGIN
  RAISE NOTICE '========================================';
  RAISE NOTICE 'Step 1 完了: scenario_master_id カラムを追加し、データを移行しました';
  RAISE NOTICE '次のステップ: アプリケーションコードを scenario_master_id 参照に変更';
  RAISE NOTICE '========================================';
END $$;

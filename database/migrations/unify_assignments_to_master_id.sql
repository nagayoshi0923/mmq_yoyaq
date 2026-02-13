-- staff_scenario_assignments.scenario_id を scenario_master_id に統一
-- 作成日: 2026-02-09
-- 概要: staff_scenario_assignments.scenario_id が旧 scenarios.id を参照しているため、
--       scenario_masters.id に統一する。これにより旧IDマッピングが不要になる。

-- ============================================================
-- STEP 0: 事前診断
-- ============================================================
SELECT '--- 移行前の状態 ---' as status;
SELECT 'total assignments: ' || COUNT(*) FROM staff_scenario_assignments;

SELECT 'scenario_id が scenarios.id にマッチ: ' || COUNT(*)
FROM staff_scenario_assignments ssa
JOIN scenarios s ON ssa.scenario_id = s.id;

SELECT 'scenario_id が scenario_masters.id にマッチ: ' || COUNT(*)
FROM staff_scenario_assignments ssa
JOIN scenario_masters sm ON ssa.scenario_id = sm.id;

SELECT 'どちらにもマッチしない: ' || COUNT(*)
FROM staff_scenario_assignments ssa
LEFT JOIN scenarios s ON ssa.scenario_id = s.id
LEFT JOIN scenario_masters sm ON ssa.scenario_id = sm.id
WHERE s.id IS NULL AND sm.id IS NULL;

-- ============================================================
-- STEP 1: 旧FK制約を先に削除（UPDATEがブロックされるため）
-- ============================================================
ALTER TABLE staff_scenario_assignments
  DROP CONSTRAINT IF EXISTS staff_scenario_assignments_scenario_id_fkey;

-- ============================================================
-- STEP 2: scenario_id を scenario_master_id に変換
-- ============================================================
-- scenarios.id → scenarios.scenario_master_id に変換
-- 既に scenario_masters.id を指しているレコードはそのまま
UPDATE staff_scenario_assignments ssa
SET scenario_id = s.scenario_master_id
FROM scenarios s
WHERE ssa.scenario_id = s.id
  AND s.scenario_master_id IS NOT NULL
  AND ssa.scenario_id != s.scenario_master_id;

-- 変換されなかった孤立レコード（どちらにもマッチしないもの）を削除
DELETE FROM staff_scenario_assignments
WHERE scenario_id NOT IN (SELECT id FROM scenario_masters);

-- ============================================================
-- STEP 3: 新FK制約を追加（scenario_masters.id を参照）
-- ============================================================
ALTER TABLE staff_scenario_assignments
  ADD CONSTRAINT staff_scenario_assignments_scenario_id_fkey
  FOREIGN KEY (scenario_id) REFERENCES scenario_masters(id) ON DELETE CASCADE
  NOT VALID;

ALTER TABLE staff_scenario_assignments
  VALIDATE CONSTRAINT staff_scenario_assignments_scenario_id_fkey;

-- ============================================================
-- STEP 4: 事後診断
-- ============================================================
SELECT '--- 移行後の状態 ---' as status;
SELECT 'total assignments: ' || COUNT(*) FROM staff_scenario_assignments;

SELECT 'scenario_masters にマッチ: ' || COUNT(*)
FROM staff_scenario_assignments ssa
JOIN scenario_masters sm ON ssa.scenario_id = sm.id;

SELECT 'マッチしない（問題あり）: ' || COUNT(*)
FROM staff_scenario_assignments ssa
LEFT JOIN scenario_masters sm ON ssa.scenario_id = sm.id
WHERE sm.id IS NULL;

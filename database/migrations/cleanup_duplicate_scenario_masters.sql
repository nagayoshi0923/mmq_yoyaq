-- 重複した scenario_masters と organization_scenarios を削除
-- 作成日: 2026-01-22
-- 
-- 背景:
-- 2025年10月頃に最初の移行で scenario_masters を作成したが、
-- scenarios.scenario_master_id と紐付けなかった（linked_scenarios = 0）
-- 2026年1月22日に新しい移行を実行し、正しく紐付けられたマスターを作成
-- 結果として同じタイトルで2つのマスターが存在
-- 
-- 安全確認済み:
-- - 古いマスター（2026-01-22より前に作成、linked_scenarios = 0）は
--   scenarios テーブルから参照されていない
-- - schedule_events からも参照されていない
-- - 削除しても既存データに影響なし

-- ========================================
-- STEP 1: 削除対象の確認（DRY RUN）
-- ========================================
-- まずこれを実行して、削除対象を確認してください

/*
SELECT 
  sm.title,
  sm.id as master_id,
  sm.created_at,
  os.id as org_scenario_id,
  'DELETE TARGET' as action
FROM scenario_masters sm
LEFT JOIN organization_scenarios os ON os.scenario_master_id = sm.id
WHERE sm.created_at < '2026-01-22'
  AND sm.id NOT IN (SELECT scenario_master_id FROM scenarios WHERE scenario_master_id IS NOT NULL)
  AND sm.title IN (
    SELECT sm2.title
    FROM scenario_masters sm2
    GROUP BY sm2.title
    HAVING COUNT(*) > 1
  )
ORDER BY sm.title;
*/

-- ========================================
-- STEP 2: organization_scenarios から削除（子テーブル）
-- ========================================
DELETE FROM organization_scenarios
WHERE scenario_master_id IN (
  SELECT sm.id
  FROM scenario_masters sm
  WHERE sm.created_at < '2026-01-22'
    AND sm.id NOT IN (SELECT scenario_master_id FROM scenarios WHERE scenario_master_id IS NOT NULL)
    AND sm.title IN (
      SELECT sm2.title
      FROM scenario_masters sm2
      GROUP BY sm2.title
      HAVING COUNT(*) > 1
    )
);

-- ========================================
-- STEP 3: scenario_masters から削除（親テーブル）
-- ========================================
DELETE FROM scenario_masters
WHERE created_at < '2026-01-22'
  AND id NOT IN (SELECT scenario_master_id FROM scenarios WHERE scenario_master_id IS NOT NULL)
  AND title IN (
    SELECT sm2.title
    FROM scenario_masters sm2
    GROUP BY sm2.title
    HAVING COUNT(*) > 1
  );

-- ========================================
-- STEP 4: 削除結果の確認
-- ========================================
-- SELECT COUNT(*) as remaining_masters FROM scenario_masters;
-- SELECT COUNT(*) as remaining_org_scenarios FROM organization_scenarios;

-- 重複がないことを確認
-- SELECT title, COUNT(*) as count
-- FROM scenario_masters
-- GROUP BY title
-- HAVING COUNT(*) > 1;


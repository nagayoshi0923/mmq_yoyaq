-- scenarios テーブルの available_stores を organization_scenarios に移行
-- 作成日: 2026-01-23
-- 概要: 旧UIの対応店舗設定を新UIの組織設定へ移行

-- ========================================
-- available_stores をコピー（空欄のみ対象）
-- ========================================
UPDATE organization_scenarios os
SET available_stores = s.available_stores
FROM scenarios s
WHERE os.scenario_master_id = s.scenario_master_id
  AND os.organization_id = s.organization_id
  AND s.available_stores IS NOT NULL
  AND array_length(s.available_stores, 1) > 0
  AND (os.available_stores IS NULL OR array_length(os.available_stores, 1) = 0 OR array_length(os.available_stores, 1) IS NULL);

-- 確認用（実行後）
-- SELECT
--   sm.title,
--   s.available_stores AS old_stores,
--   os.available_stores AS new_stores
-- FROM scenarios s
-- JOIN organization_scenarios os ON os.scenario_master_id = s.scenario_master_id
-- JOIN scenario_masters sm ON sm.id = os.scenario_master_id
-- WHERE s.available_stores IS NOT NULL
-- ORDER BY sm.title
-- LIMIT 30;


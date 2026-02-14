-- ============================================================
-- scenarios.available_stores → organization_scenarios.available_stores 同期
-- ============================================================
-- 旧UI（scenariosテーブル直接編集）で設定された対応店舗データを
-- 新UI（organization_scenarios）に同期する。
-- organization_scenarios.available_stores が空の場合のみ上書き。
-- ============================================================

UPDATE organization_scenarios os
SET 
  available_stores = s.available_stores,
  updated_at = NOW()
FROM scenarios s
WHERE os.scenario_master_id = s.scenario_master_id
  AND os.organization_id = s.organization_id
  AND s.available_stores IS NOT NULL
  AND array_length(s.available_stores, 1) > 0
  AND (os.available_stores IS NULL OR array_length(os.available_stores, 1) = 0 OR array_length(os.available_stores, 1) IS NULL);

-- ============================================================
-- kit_transfer_completions の scenario_master_id を修正
-- org_scenario_id から正しい scenario_master_id を取得して設定
-- ============================================================

-- scenario_master_id が NULL のレコードを修正
UPDATE kit_transfer_completions ktc
SET scenario_master_id = os.scenario_master_id
FROM organization_scenarios os
WHERE ktc.org_scenario_id = os.id
  AND ktc.scenario_master_id IS NULL
  AND os.scenario_master_id IS NOT NULL;

DO $$
DECLARE
  updated_count INTEGER;
BEGIN
  GET DIAGNOSTICS updated_count = ROW_COUNT;
  RAISE NOTICE '✅ kit_transfer_completions: % 件の scenario_master_id を修正しました', updated_count;
END $$;

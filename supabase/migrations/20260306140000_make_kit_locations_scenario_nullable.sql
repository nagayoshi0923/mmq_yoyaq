-- scenario_kit_locations の scenario_id を nullable に変更
-- org_scenario_id への移行のため

-- scenario_id を nullable に変更
ALTER TABLE scenario_kit_locations
  ALTER COLUMN scenario_id DROP NOT NULL;

-- コメント追加
COMMENT ON COLUMN scenario_kit_locations.scenario_id IS 
  '【非推奨】旧シナリオID（scenarios.id）。新規レコードでは org_scenario_id を使用';

COMMENT ON COLUMN scenario_kit_locations.org_scenario_id IS 
  '組織シナリオID（organization_scenarios.id）。キット配置管理に使用';

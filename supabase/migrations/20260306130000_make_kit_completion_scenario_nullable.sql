-- kit_transfer_completions の scenario_id を nullable に変更
-- org_scenario_id への移行のため、旧 scenario_id は NULL 許容にする

-- scenario_id を nullable に変更
ALTER TABLE kit_transfer_completions
  ALTER COLUMN scenario_id DROP NOT NULL;

-- 外部キー制約を削除して、org_scenario_id のみを使用するように移行
-- 旧 scenario_id は参照整合性のために残すが、新規レコードでは NULL を許容

-- コメント追加
COMMENT ON COLUMN kit_transfer_completions.scenario_id IS 
  '【非推奨】旧シナリオID（scenarios.id）。新規レコードでは org_scenario_id を使用';

COMMENT ON COLUMN kit_transfer_completions.org_scenario_id IS 
  '組織シナリオID（organization_scenarios.id）。キット移動完了記録に使用';

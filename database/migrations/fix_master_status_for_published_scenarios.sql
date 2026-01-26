-- 組織が公開中なのにマスターがdraftのものを修正
-- 公開中の組織シナリオがあれば、マスターは最低でもpendingにする

-- 1. 現状確認
SELECT 
  sm.id as master_id,
  sm.title,
  sm.master_status,
  os.org_status,
  o.name as organization_name
FROM scenario_masters sm
JOIN organization_scenarios os ON os.scenario_master_id = sm.id
JOIN organizations o ON o.id = os.organization_id
WHERE sm.master_status = 'draft'
  AND os.org_status = 'available';

-- 2. 修正実行（確認後にコメント解除して実行）
UPDATE scenario_masters sm
SET master_status = 'pending',
    updated_at = NOW()
WHERE sm.master_status = 'draft'
  AND EXISTS (
    SELECT 1 FROM organization_scenarios os
    WHERE os.scenario_master_id = sm.id
      AND os.org_status = 'available'
  );

-- 3. scenariosテーブルも同様に修正（draft → available に）
-- organization_scenariosでavailableになっているものは、scenariosもavailableにする
UPDATE scenarios s
SET status = 'available',
    updated_at = NOW()
WHERE s.status = 'draft'
  AND EXISTS (
    SELECT 1 FROM organization_scenarios os
    WHERE os.scenario_master_id = s.scenario_master_id
      AND os.organization_id = s.organization_id
      AND os.org_status = 'available'
  );




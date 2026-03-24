-- =============================================================================
-- 出張公演シナリオを予約サイトに公開
--   花街叙情物語:         2b7d9c1d-bcbb-4d9a-9f88-8b201aa368d5
--   ピアニストは音と共に: 046cafae-49cb-42e6-b4ae-74bbb489c06f
--
-- 公開に必要な条件:
--   1. scenario_masters.master_status = 'approved'
--   2. organization_scenarios.status = 'available'
--   3. organization_scenarios.org_status = 'available'
-- =============================================================================

-- 1) マスターを承認済みにする
UPDATE scenario_masters
SET master_status = 'approved'
WHERE id IN (
  '2b7d9c1d-bcbb-4d9a-9f88-8b201aa368d5'::uuid,
  '046cafae-49cb-42e6-b4ae-74bbb489c06f'::uuid
)
AND master_status IS DISTINCT FROM 'approved';

-- 2) organization_scenarios が無ければ作成、あれば org_status を公開にする
INSERT INTO organization_scenarios (organization_id, scenario_master_id, org_status, scenario_type)
VALUES
  ('a0000000-0000-0000-0000-000000000001'::uuid, '2b7d9c1d-bcbb-4d9a-9f88-8b201aa368d5'::uuid, 'available', 'normal'),
  ('a0000000-0000-0000-0000-000000000001'::uuid, '046cafae-49cb-42e6-b4ae-74bbb489c06f'::uuid, 'available', 'normal')
ON CONFLICT (organization_id, scenario_master_id)
DO UPDATE SET org_status = 'available';

-- 確認用
DO $$
DECLARE
  n_masters INTEGER;
  n_org INTEGER;
BEGIN
  SELECT COUNT(*) INTO n_masters
  FROM scenario_masters
  WHERE id IN (
    '2b7d9c1d-bcbb-4d9a-9f88-8b201aa368d5'::uuid,
    '046cafae-49cb-42e6-b4ae-74bbb489c06f'::uuid
  )
  AND master_status = 'approved';

  SELECT COUNT(*) INTO n_org
  FROM organization_scenarios
  WHERE scenario_master_id IN (
    '2b7d9c1d-bcbb-4d9a-9f88-8b201aa368d5'::uuid,
    '046cafae-49cb-42e6-b4ae-74bbb489c06f'::uuid
  )
  AND org_status = 'available';

  RAISE NOTICE '承認済みマスター: %件 / 公開中org_scenarios: %件', n_masters, n_org;
END $$;

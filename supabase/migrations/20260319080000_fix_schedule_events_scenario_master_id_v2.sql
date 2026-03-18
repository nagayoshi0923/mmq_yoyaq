-- 既存の schedule_events に scenario_master_id を設定（追加修正）
-- scenario_id が scenario_masters.id を直接指しているケースに対応

-- scenario_id が scenario_masters に存在する場合、それを scenario_master_id に設定
UPDATE schedule_events se
SET scenario_master_id = se.scenario_id
FROM scenario_masters sm
WHERE se.scenario_id = sm.id
  AND se.scenario_master_id IS NULL;

-- 更新件数を確認
DO $$
DECLARE
  updated_count INTEGER;
  remaining_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO updated_count
  FROM schedule_events
  WHERE scenario_master_id IS NOT NULL;
  
  SELECT COUNT(*) INTO remaining_count
  FROM schedule_events
  WHERE scenario_master_id IS NULL
    AND (scenario_id IS NOT NULL OR scenario IS NOT NULL);
  
  RAISE NOTICE 'schedule_events: scenario_master_id 設定済み = %, 未設定 = %', updated_count, remaining_count;
END $$;

-- シナリオ名がscenario_mastersに存在するのにscenario_master_idが未設定のイベントを紐付け
UPDATE schedule_events se
SET scenario_master_id = sm.id
FROM scenario_masters sm
WHERE se.scenario_master_id IS NULL
  AND se.scenario IS NOT NULL
  AND se.scenario != ''
  AND TRIM(se.scenario) = sm.title;

-- 結果確認
DO $$
DECLARE
  remaining_count integer;
BEGIN
  SELECT count(*) INTO remaining_count
  FROM schedule_events se
  JOIN scenario_masters sm ON TRIM(se.scenario) = sm.title
  WHERE se.scenario_master_id IS NULL
    AND se.scenario IS NOT NULL
    AND se.scenario != '';
  
  RAISE NOTICE 'マスター一致で未紐付けの残り: %件', remaining_count;
END $$;

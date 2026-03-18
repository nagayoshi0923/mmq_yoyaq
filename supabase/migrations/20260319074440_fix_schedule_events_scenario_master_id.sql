-- 既存の schedule_events に scenario_master_id を設定
-- scenario_id のみ設定されていて scenario_master_id がない公演に対して、
-- scenarios テーブルから scenario_master_id を取得して設定する

-- 1. scenarios テーブルから scenario_master_id を取得して設定
UPDATE schedule_events se
SET scenario_master_id = s.scenario_master_id
FROM scenarios s
WHERE se.scenario_id = s.id
  AND se.scenario_master_id IS NULL
  AND s.scenario_master_id IS NOT NULL;

-- 2. 更新件数をログに出力（デバッグ用）
DO $$
DECLARE
  updated_count INTEGER;
  remaining_count INTEGER;
BEGIN
  -- scenario_master_id が設定された件数を取得
  SELECT COUNT(*) INTO updated_count
  FROM schedule_events
  WHERE scenario_master_id IS NOT NULL
    AND scenario_id IS NOT NULL;
  
  -- まだ scenario_master_id が NULL の件数を取得
  SELECT COUNT(*) INTO remaining_count
  FROM schedule_events
  WHERE scenario_master_id IS NULL
    AND scenario_id IS NOT NULL;
  
  RAISE NOTICE 'schedule_events: scenario_master_id 設定済み = %, 未設定（scenario_id あり） = %', updated_count, remaining_count;
END $$;

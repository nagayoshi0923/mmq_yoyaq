-- =============================================================================
-- 20260315020000: schedule_events.scenario から【貸切希望】プレフィックスを除去
-- =============================================================================
-- 問題: create_private_booking_request RPC で予約タイトルに「【貸切希望】」が付加され、
--       approve_private_booking でそのまま schedule_events.scenario に使用されていた
-- 修正: 既存のデータから「【貸切希望】」プレフィックスを除去
-- =============================================================================

-- 既存の schedule_events から【貸切希望】プレフィックスを除去
UPDATE schedule_events 
SET scenario = REGEXP_REPLACE(scenario, '^【貸切希望】', '')
WHERE scenario LIKE '【貸切希望】%';

-- 【貸切】プレフィックスも同様に除去
UPDATE schedule_events 
SET scenario = REGEXP_REPLACE(scenario, '^【貸切】', '')
WHERE scenario LIKE '【貸切】%';

-- 通知
DO $$
DECLARE
  v_count INTEGER;
BEGIN
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RAISE NOTICE 'schedule_events のシナリオ名から【貸切希望】プレフィックスを除去しました (% 件)', v_count;
END $$;

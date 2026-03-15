-- =============================================================================
-- マイグレーション: 4時間前チェックのタイムゾーン問題を修正
-- =============================================================================
-- 
-- 問題: 
--   se.date + se.start_time がタイムゾーンなしのtimestampを生成し、
--   NOW() (UTC) と比較する際にJSTとUTCの差（9時間）が考慮されていなかった
--
-- 修正:
--   イベント日時をJST (+09:00) として明示的に解釈する
--
-- =============================================================================

CREATE OR REPLACE FUNCTION check_performances_four_hours_before()
RETURNS TABLE(
  events_checked INTEGER,
  events_confirmed INTEGER,
  events_cancelled INTEGER,
  details JSONB
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_events_checked INTEGER := 0;
  v_events_confirmed INTEGER := 0;
  v_events_cancelled INTEGER := 0;
  v_details JSONB := '[]'::JSONB;
  v_event RECORD;
  v_current INTEGER;
  v_max INTEGER;
  v_result TEXT;
  v_now_jst TIMESTAMPTZ;
  v_check_time_jst TIMESTAMPTZ;
BEGIN
  -- 現在時刻をJSTで取得
  v_now_jst := NOW() AT TIME ZONE 'Asia/Tokyo';
  -- 4時間後のチェック時刻
  v_check_time_jst := v_now_jst + INTERVAL '4 hours';
  
  RAISE NOTICE '🕐 4時間前チェック開始: NOW(JST)=%, CHECK_TIME(JST)=%', v_now_jst, v_check_time_jst;
  
  -- 延長されたオープン公演で、4時間以内に開始するものを取得
  -- 日時をJSTとして解釈して比較
  FOR v_event IN
    SELECT 
      se.id,
      se.date,
      se.start_time,
      se.scenario,
      se.current_participants,
      COALESCE(
        se.max_participants,
        sm.player_count_max,
        s.player_count_max,
        8
      ) as max_participants,
      se.organization_id,
      se.gms,
      se.store_id,
      st.name as store_name,
      -- イベント日時をJST (+09:00) として解釈
      (se.date::text || ' ' || se.start_time::text || '+09:00')::timestamptz as event_datetime_jst
    FROM schedule_events se
    LEFT JOIN organization_scenarios os ON se.organization_scenario_id = os.id
    LEFT JOIN scenario_masters sm ON os.scenario_master_id = sm.id
    LEFT JOIN scenarios s ON se.scenario_id = s.id
    LEFT JOIN stores st ON se.store_id = st.id
    WHERE se.is_recruitment_extended = TRUE
      AND se.is_cancelled = false
      -- イベント日時（JST）がチェック時刻（JST）以前で、現在時刻より後
      AND (se.date::text || ' ' || se.start_time::text || '+09:00')::timestamptz <= v_check_time_jst
      AND (se.date::text || ' ' || se.start_time::text || '+09:00')::timestamptz > v_now_jst
      AND se.category = 'open'
      AND NOT EXISTS (
        SELECT 1 FROM performance_cancellation_logs pcl
        WHERE pcl.schedule_event_id = se.id
        AND pcl.check_type = 'four_hours_before'
      )
    ORDER BY se.date, se.start_time
  LOOP
    RAISE NOTICE '📋 イベント検出: id=%, scenario=%, datetime=%', v_event.id, v_event.scenario, v_event.event_datetime_jst;
    
    v_events_checked := v_events_checked + 1;
    v_current := COALESCE(v_event.current_participants, 0);
    v_max := v_event.max_participants;
    
    IF v_current >= v_max THEN
      v_result := 'confirmed';
      v_events_confirmed := v_events_confirmed + 1;
      
      UPDATE schedule_events
      SET is_recruitment_extended = FALSE,
          updated_at = NOW()
      WHERE id = v_event.id;
    ELSE
      v_result := 'cancelled';
      v_events_cancelled := v_events_cancelled + 1;
      
      UPDATE schedule_events
      SET is_cancelled = TRUE,
          is_recruitment_extended = FALSE,
          updated_at = NOW()
      WHERE id = v_event.id;
    END IF;
    
    INSERT INTO performance_cancellation_logs (
      schedule_event_id,
      organization_id,
      check_type,
      current_participants,
      max_participants,
      result
    ) VALUES (
      v_event.id,
      v_event.organization_id,
      'four_hours_before',
      v_current,
      v_max,
      v_result
    );
    
    v_details := v_details || jsonb_build_object(
      'event_id', v_event.id,
      'date', v_event.date,
      'start_time', v_event.start_time,
      'scenario', v_event.scenario,
      'store_name', v_event.store_name,
      'current_participants', v_current,
      'max_participants', v_max,
      'result', v_result,
      'organization_id', v_event.organization_id,
      'gms', v_event.gms
    );
  END LOOP;
  
  RAISE NOTICE '✅ 4時間前チェック完了: checked=%, confirmed=%, cancelled=%', v_events_checked, v_events_confirmed, v_events_cancelled;
  
  RETURN QUERY SELECT 
    v_events_checked,
    v_events_confirmed,
    v_events_cancelled,
    v_details;
END;
$$;

COMMENT ON FUNCTION check_performances_four_hours_before() IS 
'4時間前に実行する公演中止判定（延長されたオープン公演のみ、JSTタイムゾーン対応）';

-- 完了確認
DO $$ 
BEGIN
  RAISE NOTICE '✅ マイグレーション完了: 4時間前チェックのタイムゾーン問題を修正';
  RAISE NOTICE '   - イベント日時をJST (+09:00) として解釈';
  RAISE NOTICE '   - NOW() AT TIME ZONE Asia/Tokyo でJST比較';
END $$;

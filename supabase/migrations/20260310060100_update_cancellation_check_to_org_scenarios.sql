-- =============================================================================
-- マイグレーション: 公演中止判定関数を organization_scenarios 対応に更新
-- =============================================================================
-- 
-- 作成日: 2026-03-10
-- 
-- 変更:
--   scenarios テーブルではなく organization_scenarios + scenario_masters から
--   player_count_max を取得するように変更。
-- 
-- =============================================================================

-- 1. 前日チェック用RPC関数（organization_scenarios対応）
CREATE OR REPLACE FUNCTION check_performances_day_before()
RETURNS TABLE(
  events_checked INTEGER,
  events_confirmed INTEGER,
  events_extended INTEGER,
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
  v_events_extended INTEGER := 0;
  v_events_cancelled INTEGER := 0;
  v_details JSONB := '[]'::JSONB;
  v_event RECORD;
  v_current INTEGER;
  v_max INTEGER;
  v_half INTEGER;
  v_result TEXT;
BEGIN
  -- 明日開催のオープン公演を取得（貸切・GMテストは除外）
  -- organization_scenarios + scenario_masters を優先、scenarios にフォールバック
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
      st.name as store_name
    FROM schedule_events se
    LEFT JOIN organization_scenarios os ON se.organization_scenario_id = os.id
    LEFT JOIN scenario_masters sm ON os.scenario_master_id = sm.id
    LEFT JOIN scenarios s ON se.scenario_id = s.id
    LEFT JOIN stores st ON se.store_id = st.id
    WHERE se.date = CURRENT_DATE + INTERVAL '1 day'
      AND se.is_cancelled = false
      AND se.is_recruitment_extended IS NOT TRUE
      AND se.category = 'open'
    ORDER BY se.start_time
  LOOP
    v_events_checked := v_events_checked + 1;
    v_current := COALESCE(v_event.current_participants, 0);
    v_max := v_event.max_participants;
    v_half := CEIL(v_max::NUMERIC / 2);
    
    IF v_current >= v_max THEN
      v_result := 'confirmed';
      v_events_confirmed := v_events_confirmed + 1;
    ELSIF v_current >= v_half THEN
      v_result := 'extended';
      v_events_extended := v_events_extended + 1;
      
      UPDATE schedule_events
      SET is_recruitment_extended = TRUE,
          updated_at = NOW()
      WHERE id = v_event.id;
    ELSE
      v_result := 'cancelled';
      v_events_cancelled := v_events_cancelled + 1;
      
      UPDATE schedule_events
      SET is_cancelled = TRUE,
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
      'day_before',
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
      'half_required', v_half,
      'result', v_result,
      'organization_id', v_event.organization_id,
      'gms', v_event.gms
    );
  END LOOP;
  
  RETURN QUERY SELECT 
    v_events_checked,
    v_events_confirmed,
    v_events_extended,
    v_events_cancelled,
    v_details;
END;
$$;

COMMENT ON FUNCTION check_performances_day_before() IS 
'前日23:59に実行する公演中止判定（オープン公演のみ、organization_scenarios対応）';

-- 2. 4時間前チェック用RPC関数（organization_scenarios対応）
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
  v_check_time TIMESTAMPTZ;
BEGIN
  v_check_time := NOW() + INTERVAL '4 hours';
  
  -- 延長されたオープン公演で、4時間以内に開始するものを取得
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
      (se.date + se.start_time::time) as event_datetime
    FROM schedule_events se
    LEFT JOIN organization_scenarios os ON se.organization_scenario_id = os.id
    LEFT JOIN scenario_masters sm ON os.scenario_master_id = sm.id
    LEFT JOIN scenarios s ON se.scenario_id = s.id
    LEFT JOIN stores st ON se.store_id = st.id
    WHERE se.is_recruitment_extended = TRUE
      AND se.is_cancelled = false
      AND (se.date + se.start_time::time) <= v_check_time
      AND (se.date + se.start_time::time) > NOW()
      AND se.category = 'open'
      AND NOT EXISTS (
        SELECT 1 FROM performance_cancellation_logs pcl
        WHERE pcl.schedule_event_id = se.id
        AND pcl.check_type = 'four_hours_before'
      )
    ORDER BY se.date, se.start_time
  LOOP
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
  
  RETURN QUERY SELECT 
    v_events_checked,
    v_events_confirmed,
    v_events_cancelled,
    v_details;
END;
$$;

COMMENT ON FUNCTION check_performances_four_hours_before() IS 
'4時間前に実行する公演中止判定（延長されたオープン公演のみ、organization_scenarios対応）';

-- 完了確認
DO $$ 
BEGIN
  RAISE NOTICE '✅ マイグレーション完了: 公演中止判定関数を organization_scenarios 対応に更新';
  RAISE NOTICE '   - organization_scenarios + scenario_masters を優先';
  RAISE NOTICE '   - 旧 scenarios テーブルにフォールバック';
END $$;

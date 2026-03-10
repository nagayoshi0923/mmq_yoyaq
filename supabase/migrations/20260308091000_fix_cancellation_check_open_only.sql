-- =============================================================================
-- マイグレーション: 公演中止判定をオープン公演のみに限定
-- =============================================================================
-- 
-- 作成日: 2026-03-08
-- 
-- 変更:
--   check_performances_day_before と check_performances_four_hours_before を
--   オープン公演（category = 'open'）のみを対象にするように修正。
--   貸切（private）やGMテスト（gm_test）は中止判定の対象外とする。
-- 
-- =============================================================================

-- 1. 前日チェック用RPC関数（オープン公演のみ）
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
  FOR v_event IN
    SELECT 
      se.id,
      se.date,
      se.start_time,
      se.scenario,
      se.current_participants,
      COALESCE(se.max_participants, s.player_count_max, 8) as max_participants,
      se.organization_id,
      se.gms,
      se.store_id,
      st.name as store_name
    FROM schedule_events se
    LEFT JOIN scenarios s ON se.scenario_id = s.id
    LEFT JOIN stores st ON se.store_id = st.id
    WHERE se.date = CURRENT_DATE + INTERVAL '1 day'
      AND se.is_cancelled = false
      AND se.is_recruitment_extended IS NOT TRUE
      AND se.category = 'open'  -- オープン公演のみ（private, gm_testを除外）
    ORDER BY se.start_time
  LOOP
    v_events_checked := v_events_checked + 1;
    v_current := COALESCE(v_event.current_participants, 0);
    v_max := v_event.max_participants;
    v_half := CEIL(v_max::NUMERIC / 2);
    
    IF v_current >= v_max THEN
      -- 満席 → 公演確定
      v_result := 'confirmed';
      v_events_confirmed := v_events_confirmed + 1;
    ELSIF v_current >= v_half THEN
      -- 過半数以上 → 募集延長
      v_result := 'extended';
      v_events_extended := v_events_extended + 1;
      
      -- 延長フラグを設定
      UPDATE schedule_events
      SET is_recruitment_extended = TRUE,
          updated_at = NOW()
      WHERE id = v_event.id;
    ELSE
      -- 過半数未満 → 公演中止
      v_result := 'cancelled';
      v_events_cancelled := v_events_cancelled + 1;
      
      -- 公演を中止に設定
      UPDATE schedule_events
      SET is_cancelled = TRUE,
          updated_at = NOW()
      WHERE id = v_event.id;
    END IF;
    
    -- ログに記録
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
    
    -- 詳細情報を追加
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
'前日23:59に実行する公演中止判定（オープン公演のみ）。満席→確定、過半数→延長、未満→中止';

-- 2. 4時間前チェック用RPC関数（オープン公演のみ）
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
  -- 現在時刻から4時間後
  v_check_time := NOW() + INTERVAL '4 hours';
  
  -- 延長されたオープン公演で、4時間以内に開始するものを取得（貸切・GMテストは除外）
  FOR v_event IN
    SELECT 
      se.id,
      se.date,
      se.start_time,
      se.scenario,
      se.current_participants,
      COALESCE(se.max_participants, s.player_count_max, 8) as max_participants,
      se.organization_id,
      se.gms,
      se.store_id,
      st.name as store_name,
      (se.date + se.start_time::time) as event_datetime
    FROM schedule_events se
    LEFT JOIN scenarios s ON se.scenario_id = s.id
    LEFT JOIN stores st ON se.store_id = st.id
    WHERE se.is_recruitment_extended = TRUE
      AND se.is_cancelled = false
      AND (se.date + se.start_time::time) <= v_check_time
      AND (se.date + se.start_time::time) > NOW()
      AND se.category = 'open'  -- オープン公演のみ（private, gm_testを除外）
      -- 既に4時間前チェック済みを除外
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
      -- 満席 → 公演確定
      v_result := 'confirmed';
      v_events_confirmed := v_events_confirmed + 1;
      
      -- 延長フラグをクリア
      UPDATE schedule_events
      SET is_recruitment_extended = FALSE,
          updated_at = NOW()
      WHERE id = v_event.id;
    ELSE
      -- 満席でない → 公演中止
      v_result := 'cancelled';
      v_events_cancelled := v_events_cancelled + 1;
      
      -- 公演を中止に設定
      UPDATE schedule_events
      SET is_cancelled = TRUE,
          is_recruitment_extended = FALSE,
          updated_at = NOW()
      WHERE id = v_event.id;
    END IF;
    
    -- ログに記録
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
    
    -- 詳細情報を追加
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
'4時間前に実行する公演中止判定（延長されたオープン公演のみ）。満席→確定、それ以外→中止';

-- 完了確認
DO $$ 
BEGIN
  RAISE NOTICE '✅ マイグレーション完了: 公演中止判定をオープン公演のみに限定';
  RAISE NOTICE '   - 貸切（private）は中止判定の対象外';
  RAISE NOTICE '   - GMテスト（gm_test）は中止判定の対象外';
END $$;

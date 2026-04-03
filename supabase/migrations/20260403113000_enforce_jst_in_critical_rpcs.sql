-- =============================================================================
-- マイグレーション: 重要RPCのJST基準を強制
-- =============================================================================
--
-- 目的:
--   予約/中止判定で発生しやすいタイムゾーン混在を防ぐため、
--   重要RPCをJST基準に統一する。
--
-- 対応:
--   1) day_before判定をJST日付で判定
--   2) 重要RPCに function-level timezone='Asia/Tokyo' を強制
-- =============================================================================

-- 1. 前日判定をJST日付で統一
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
  v_target_date_jst DATE;
BEGIN
  -- JST基準の「明日」
  v_target_date_jst := (timezone('Asia/Tokyo', NOW())::date + 1);

  -- 明日開催のオープン公演を取得（貸切・GMテスト・シナリオ未設定は除外）
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
      ) AS max_participants,
      se.organization_id,
      se.gms,
      se.store_id,
      st.name AS store_name
    FROM schedule_events se
    LEFT JOIN organization_scenarios os ON se.organization_scenario_id = os.id
    LEFT JOIN scenario_masters sm ON os.scenario_master_id = sm.id
    LEFT JOIN scenarios s ON se.scenario_id = s.id
    LEFT JOIN stores st ON se.store_id = st.id
    WHERE se.date = v_target_date_jst
      AND se.is_cancelled = FALSE
      AND se.is_recruitment_extended IS NOT TRUE
      AND se.category = 'open'
      AND se.scenario IS NOT NULL
      AND se.scenario != ''
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
'前日23:59に実行する公演中止判定（JST基準・オープン公演のみ）';

-- 2. 重要RPCへJSTタイムゾーンを強制
DO $$
DECLARE
  v_func RECORD;
BEGIN
  FOR v_func IN
    SELECT p.oid::regprocedure::text AS func_sig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = ANY(ARRAY[
        'check_performances_day_before',
        'check_performances_four_hours_before',
        'create_reservation_with_lock_v2',
        'create_reservation_with_lock'
      ])
  LOOP
    EXECUTE format('ALTER FUNCTION %s SET timezone TO %L', v_func.func_sig, 'Asia/Tokyo');
    RAISE NOTICE '✅ timezone=Asia/Tokyo を設定: %', v_func.func_sig;
  END LOOP;
END $$;

DO $$
BEGIN
  RAISE NOTICE '✅ マイグレーション完了: 重要RPCのJST基準を強制';
END $$;


-- =============================================================================
-- マイグレーション: 中止判定RPCの参加者数上限を正しく解決する
-- =============================================================================
--
-- 問題:
--   中止判定RPCが max_participants を以下の優先順位で取得していた:
--     1. se.max_participants（イベント個別設定 - 古いデータでは8が設定されている場合あり）
--     2. sm.player_count_max（scenario_masters経由 - organization_scenario_id JOINが必要）
--     3. s.player_count_max（旧scenariosテーブル）
--     4. フォールバック 8
--
--   これにより、組織のオーバーライド値が反映されず、
--   6人用シナリオが8人として中止判定されるケースがあった。
--
-- 修正:
--   - organization_scenarios.override_player_count_max を最優先で使用
--   - scenario_master_id での直接JOINをフォールバックに追加
--     （organization_scenario_id が NULL の古いイベント対応）
--   - se.max_participants の優先順位を下げる
-- =============================================================================

-- 1. 前日判定を修正
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
  v_reservation_count INTEGER;
  v_unsynced_staff INTEGER;
  v_max INTEGER;
  v_half INTEGER;
  v_result TEXT;
  v_target_date_jst DATE;
BEGIN
  v_target_date_jst := (timezone('Asia/Tokyo', NOW())::date + 1);

  FOR v_event IN
    SELECT
      se.id,
      se.date,
      se.start_time,
      se.scenario,
      se.gm_roles,
      COALESCE(
        os.override_player_count_max,
        sm.player_count_max,
        sm2.player_count_max,
        se.max_participants,
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
    LEFT JOIN scenario_masters sm2 ON se.scenario_master_id = sm2.id
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

    SELECT COALESCE(SUM(r.participant_count), 0) INTO v_reservation_count
    FROM reservations r
    WHERE r.schedule_event_id = v_event.id
      AND r.status IN ('pending', 'confirmed', 'gm_confirmed', 'checked_in');

    -- gm_roles のスタッフ参加で未同期分をカウント（サブクエリで jsonb_each_text を展開）
    SELECT COUNT(*) INTO v_unsynced_staff
    FROM (
      SELECT key AS staff_name, value AS staff_role
      FROM jsonb_each_text(COALESCE(v_event.gm_roles, '{}'::jsonb))
    ) AS gm_staff
    WHERE gm_staff.staff_role = 'staff'
      AND NOT EXISTS (
        SELECT 1 FROM reservations r2
        WHERE r2.schedule_event_id = v_event.id
          AND r2.status IN ('pending', 'confirmed', 'gm_confirmed', 'checked_in')
          AND r2.reservation_source = 'staff_entry'
          AND gm_staff.staff_name = ANY(r2.participant_names)
      );

    v_current := v_reservation_count + v_unsynced_staff;
    v_max := v_event.max_participants;
    v_half := CEIL(v_max::NUMERIC / 2);

    IF v_current >= v_half THEN
      v_result := 'confirmed';
      v_events_confirmed := v_events_confirmed + 1;
    ELSE
      v_result := 'extended';
      v_events_extended := v_events_extended + 1;

      UPDATE schedule_events
      SET is_recruitment_extended = TRUE
      WHERE id = v_event.id;
    END IF;

    v_details := v_details || jsonb_build_array(jsonb_build_object(
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
      'gms', to_jsonb(v_event.gms)
    ));
  END LOOP;

  RETURN QUERY SELECT v_events_checked, v_events_confirmed, v_events_extended, v_events_cancelled, v_details;
END;
$$;

COMMENT ON FUNCTION check_performances_day_before IS
'前日23:59に実行する公演中止判定（organization_scenariosのオーバーライドを反映）';

-- 2. 4時間前判定を修正
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
  v_reservation_count INTEGER;
  v_unsynced_staff INTEGER;
  v_max INTEGER;
  v_result TEXT;
  v_now TIMESTAMPTZ;
  v_check_time TIMESTAMPTZ;
BEGIN
  v_now := NOW();
  v_check_time := v_now + INTERVAL '4 hours';

  RAISE NOTICE '4時間前チェック開始: NOW(JST)=%, CHECK_TIME(JST)=%',
    timezone('Asia/Tokyo', v_now),
    timezone('Asia/Tokyo', v_check_time);

  FOR v_event IN
    SELECT
      se.id,
      se.date,
      se.start_time,
      se.scenario,
      se.gm_roles,
      COALESCE(
        os.override_player_count_max,
        sm.player_count_max,
        sm2.player_count_max,
        se.max_participants,
        s.player_count_max,
        8
      ) AS max_participants,
      se.organization_id,
      se.gms,
      se.store_id,
      st.name AS store_name,
      (se.date::text || ' ' || se.start_time::text || '+09:00')::timestamptz AS event_datetime
    FROM schedule_events se
    LEFT JOIN organization_scenarios os ON se.organization_scenario_id = os.id
    LEFT JOIN scenario_masters sm ON os.scenario_master_id = sm.id
    LEFT JOIN scenario_masters sm2 ON se.scenario_master_id = sm2.id
    LEFT JOIN scenarios s ON se.scenario_id = s.id
    LEFT JOIN stores st ON se.store_id = st.id
    WHERE se.is_recruitment_extended = TRUE
      AND se.is_cancelled = FALSE
      AND se.category = 'open'
      AND se.scenario IS NOT NULL
      AND se.scenario != ''
      AND (se.date::text || ' ' || se.start_time::text || '+09:00')::timestamptz <= v_check_time
      AND (se.date::text || ' ' || se.start_time::text || '+09:00')::timestamptz > v_now
      AND NOT EXISTS (
        SELECT 1 FROM performance_cancellation_logs pcl
        WHERE pcl.schedule_event_id = se.id
          AND pcl.check_type = 'four_hours_before'
      )
    ORDER BY se.date, se.start_time
  LOOP
    RAISE NOTICE 'イベント検出: id=%, scenario=%, datetime_jst=%',
      v_event.id,
      v_event.scenario,
      timezone('Asia/Tokyo', v_event.event_datetime);

    v_events_checked := v_events_checked + 1;

    SELECT COALESCE(SUM(r.participant_count), 0) INTO v_reservation_count
    FROM reservations r
    WHERE r.schedule_event_id = v_event.id
      AND r.status IN ('pending', 'confirmed', 'gm_confirmed', 'checked_in');

    -- gm_roles のスタッフ参加で未同期分をカウント
    SELECT COUNT(*) INTO v_unsynced_staff
    FROM (
      SELECT key AS staff_name, value AS staff_role
      FROM jsonb_each_text(COALESCE(v_event.gm_roles, '{}'::jsonb))
    ) AS gm_staff
    WHERE gm_staff.staff_role = 'staff'
      AND NOT EXISTS (
        SELECT 1 FROM reservations r2
        WHERE r2.schedule_event_id = v_event.id
          AND r2.status IN ('pending', 'confirmed', 'gm_confirmed', 'checked_in')
          AND r2.reservation_source = 'staff_entry'
          AND gm_staff.staff_name = ANY(r2.participant_names)
      );

    v_current := v_reservation_count + v_unsynced_staff;
    v_max := v_event.max_participants;

    RAISE NOTICE '参加者数: reservation=%, unsynced_staff=%, total=%, max=%, half=%',
      v_reservation_count, v_unsynced_staff, v_current, v_max, CEIL(v_max::NUMERIC / 2);

    IF v_current >= 1 THEN
      v_result := 'confirmed';
      v_events_confirmed := v_events_confirmed + 1;
    ELSE
      v_result := 'cancelled';
      v_events_cancelled := v_events_cancelled + 1;

      UPDATE schedule_events
      SET is_cancelled = TRUE
      WHERE id = v_event.id;

      INSERT INTO performance_cancellation_logs (schedule_event_id, check_type, result, participants_count, max_participants)
      VALUES (v_event.id, 'four_hours_before', 'cancelled', v_current, v_max);
    END IF;

    v_details := v_details || jsonb_build_array(jsonb_build_object(
      'event_id', v_event.id,
      'date', v_event.date,
      'start_time', v_event.start_time,
      'scenario', v_event.scenario,
      'store_name', v_event.store_name,
      'current_participants', v_current,
      'max_participants', v_max,
      'result', v_result,
      'organization_id', v_event.organization_id,
      'gms', to_jsonb(v_event.gms)
    ));
  END LOOP;

  RETURN QUERY SELECT v_events_checked, v_events_confirmed, v_events_cancelled, v_details;
END;
$$;

COMMENT ON FUNCTION check_performances_four_hours_before IS
'4時間前に実行する公演中止判定（organization_scenariosのオーバーライドを反映）';

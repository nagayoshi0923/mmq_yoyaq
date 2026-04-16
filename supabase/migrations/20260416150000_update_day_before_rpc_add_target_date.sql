-- =============================================================================
-- マイグレーション: check_performances_day_before に p_target_date 引数を追加
-- =============================================================================
--
-- 変更内容:
--   check_performances_day_before() → check_performances_day_before(p_target_date DATE DEFAULT NULL)
--
--   p_target_date が渡された場合はその日付を使用。
--   NULL の場合は従来通り NOW()::date + 1 で計算（後方互換性を維持）。
--
--   cron コマンドで target_date を body に含めることで、
--   Edge Function がいつ実行されても正しい日付が使われる。
-- =============================================================================

-- p_target_date: cronから明示的に渡された対象日付。NULLの場合はNOW()+1で計算。
-- レースコンディション対策: cronがキュー積み時点の日付をbodyに含めて渡すことで、
-- Edge Functionがいつ実行されても正しい翌日を対象にできる。
CREATE OR REPLACE FUNCTION check_performances_day_before(p_target_date DATE DEFAULT NULL)
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
  -- 引数が渡された場合はそれを使用、なければ NOW()+1 で計算
  v_target_date_jst := COALESCE(p_target_date, (timezone('Asia/Tokyo', NOW())::date + 1));

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
          current_participants = v_current,
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

COMMENT ON FUNCTION check_performances_day_before(DATE) IS
'前日23:59に実行する公演中止判定（実予約＋未同期スタッフ・organization_scenariosの定員反映）。p_target_dateを指定すると任意の日付を対象にできる。';

ALTER FUNCTION check_performances_day_before(DATE) SET timezone TO 'Asia/Tokyo';

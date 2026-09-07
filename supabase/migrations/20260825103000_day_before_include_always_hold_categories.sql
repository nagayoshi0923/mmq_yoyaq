-- 中止判断に貸切・GMテスト・出張・テスト・MTG・会場レンタル・パッケージを載せる。
-- これらは人数に関係なく開催決定。open の人数判定は変えない。
-- 破壊的変更なし（CREATE OR REPLACE のみ）。
-- ロールバック: 直前の day_before 定義（open のみ）に戻す。
-- 正本: supabase/rpcs/check_performances_day_before.sql

CREATE OR REPLACE FUNCTION check_performances_day_before(p_target_date DATE DEFAULT NULL, p_dry_run BOOLEAN DEFAULT FALSE)
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
SET timezone TO 'Asia/Tokyo'
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
  v_min INTEGER;
  v_half INTEGER;
  v_result TEXT;
  v_target_date_jst DATE;
BEGIN
  IF p_target_date IS NOT NULL THEN
    v_target_date_jst := p_target_date;
  ELSE
    v_target_date_jst := (timezone('Asia/Tokyo', NOW())::date + 1);
  END IF;

  RAISE NOTICE '前日チェック開始: 対象日=%, dry_run=%', v_target_date_jst, p_dry_run;

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
      COALESCE(
        os.override_player_count_min,
        sm.player_count_min,
        sm2.player_count_min,
        s.player_count_min,
        CEIL(COALESCE(
          os.override_player_count_max,
          sm.player_count_max,
          sm2.player_count_max,
          se.max_participants,
          s.player_count_max,
          8
        )::NUMERIC / 2)::INTEGER
      ) AS min_participants,
      se.organization_id,
      se.gms,
      se.store_id,
      se.category,
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
      AND se.category IN (
        'open',
        'private',
        'gmtest',
        'testplay',
        'offsite',
        'venue_rental',
        'venue_rental_free',
        'package',
        'mtg'
      )
      AND (
        se.category <> 'open'
        OR (se.scenario IS NOT NULL AND se.scenario != '')
      )
      AND NOT EXISTS (
        SELECT 1 FROM performance_cancellation_logs pcl
        WHERE pcl.schedule_event_id = se.id
          AND pcl.check_type = 'day_before'
      )
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

    v_min := GREATEST(COALESCE(v_event.min_participants, 1), 1);
    IF v_min > v_max THEN
      v_min := GREATEST(v_max, 1);
    END IF;
    v_half := GREATEST(CEIL(v_min::NUMERIC / 2)::INTEGER, 1);

    IF v_event.category IS DISTINCT FROM 'open' THEN
      v_result := 'confirmed';
      v_events_confirmed := v_events_confirmed + 1;
    ELSIF v_current >= v_min THEN
      v_result := 'confirmed';
      v_events_confirmed := v_events_confirmed + 1;
    ELSIF v_current >= v_half THEN
      v_result := 'extended';
      v_events_extended := v_events_extended + 1;

      IF NOT COALESCE(p_dry_run, FALSE) THEN
        UPDATE schedule_events
        SET is_recruitment_extended = TRUE,
            updated_at = NOW()
        WHERE id = v_event.id;
      END IF;
    ELSE
      v_result := 'cancelled';
      v_events_cancelled := v_events_cancelled + 1;

      IF NOT COALESCE(p_dry_run, FALSE) THEN
        UPDATE schedule_events
        SET is_cancelled = TRUE,
            updated_at = NOW()
        WHERE id = v_event.id;
      END IF;
    END IF;

    IF NOT COALESCE(p_dry_run, FALSE) THEN
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
    END IF;

    v_details := v_details || jsonb_build_array(jsonb_build_object(
      'event_id', v_event.id,
      'date', v_event.date,
      'start_time', v_event.start_time,
      'scenario', v_event.scenario,
      'store_name', v_event.store_name,
      'current_participants', v_current,
      'max_participants', v_max,
      'min_required', v_min,
      'half_required', v_half,
      'result', v_result,
      'category', v_event.category,
      'organization_id', v_event.organization_id,
      'gms', to_jsonb(v_event.gms)
    ));
  END LOOP;

  RETURN QUERY SELECT
    v_events_checked,
    v_events_confirmed,
    v_events_extended,
    v_events_cancelled,
    v_details;
END;
$$;

COMMENT ON FUNCTION check_performances_day_before(DATE, BOOLEAN) IS
'前日23:59の中止判断。openは最低開催人数で開催／半分で延長／未満で中止。貸切・GMテスト・出張・テスト・MTG・会場レンタル・パッケージは人数に関係なく開催決定。p_dry_run=TRUE なら書き込みしない（21:00予告）。';

ALTER FUNCTION check_performances_day_before(DATE, BOOLEAN) SET timezone TO 'Asia/Tokyo';

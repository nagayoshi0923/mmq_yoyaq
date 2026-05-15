-- =============================================================================
-- 前日中止判定RPC修正: text オーバーロードを削除し date 版に統一
-- =============================================================================
--
-- 問題:
--   20260516000000 で p_target_date TEXT DEFAULT NULL を追加したが、
--   既存の p_target_date DATE 版と競合し PGRST203 エラーが発生。
--
-- 修正:
--   - text 版を DROP
--   - 単一の date 版として再定義（NOT EXISTS ガード・jsonb_build_array も含む）
-- =============================================================================

-- 競合する全バージョンを削除してから再作成
DROP FUNCTION IF EXISTS public.check_performances_day_before(p_target_date text);
DROP FUNCTION IF EXISTS public.check_performances_day_before();  -- 旧no-param版も削除

-- date 版として統一（NOT EXISTS ガード込み）
CREATE OR REPLACE FUNCTION check_performances_day_before(
  p_target_date DATE DEFAULT NULL
)
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
  v_half INTEGER;
  v_result TEXT;
  v_target_date_jst DATE;
BEGIN
  -- p_target_date が指定されていれば使用、なければ JST の明日を計算
  IF p_target_date IS NOT NULL THEN
    v_target_date_jst := p_target_date;
  ELSE
    v_target_date_jst := (timezone('Asia/Tokyo', NOW())::date + 1);
  END IF;

  RAISE NOTICE '前日チェック開始: 対象日=%', v_target_date_jst;

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
      -- 既に処理済みのイベントはスキップ（重複実行・UNIQUE制約違反防止）
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
    v_half := CEIL(v_max::NUMERIC / 2);

    RAISE NOTICE 'イベント: id=%, scenario=%, participants=%, max=%, half=%',
      v_event.id, v_event.scenario, v_current, v_max, v_half;

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

  RAISE NOTICE '前日チェック完了: checked=%, confirmed=%, extended=%, cancelled=%',
    v_events_checked, v_events_confirmed, v_events_extended, v_events_cancelled;

  RETURN QUERY SELECT
    v_events_checked,
    v_events_confirmed,
    v_events_extended,
    v_events_cancelled,
    v_details;
END;
$$;

COMMENT ON FUNCTION check_performances_day_before(DATE) IS
'前日23:59に実行する公演中止判定。p_target_date(DATE)省略時はJST翌日を対象とする。';

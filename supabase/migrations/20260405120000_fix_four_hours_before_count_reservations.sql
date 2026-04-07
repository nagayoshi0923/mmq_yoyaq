-- =============================================================================
-- マイグレーション: 4時間前中止判定の参加者数をDBのcurrent_participantsではなく
-- 実際の予約から直接カウントするよう修正
-- =============================================================================
--
-- 問題:
--   check_performances_four_hours_before() で se.current_participants を使って
--   満席判定をしていたが、この値がチェックイン済み予約を含まない場合があり、
--   実際は満席なのに「人数未達」として中止判定される不具合が発生した。
--
-- 修正:
--   reservations テーブルから直接 participant_count を合計してカウントする。
--   対象ステータス: pending, confirmed, gm_confirmed, checked_in（キャンセル除外）
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
  v_now TIMESTAMPTZ;
  v_check_time TIMESTAMPTZ;
BEGIN
  -- 絶対時刻で比較（UTC基準）。表示時のみJSTへ変換する。
  v_now := NOW();
  v_check_time := v_now + INTERVAL '4 hours';

  RAISE NOTICE '🕐 4時間前チェック開始: NOW(JST)=%, CHECK_TIME(JST)=%',
    timezone('Asia/Tokyo', v_now),
    timezone('Asia/Tokyo', v_check_time);

  -- 延長されたオープン公演で、4時間以内に開始するものを取得（シナリオ未設定は除外）
  FOR v_event IN
    SELECT
      se.id,
      se.date,
      se.start_time,
      se.scenario,
      COALESCE(
        se.max_participants,
        sm.player_count_max,
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
    RAISE NOTICE '📋 イベント検出: id=%, scenario=%, datetime_jst=%',
      v_event.id,
      v_event.scenario,
      timezone('Asia/Tokyo', v_event.event_datetime);

    v_events_checked := v_events_checked + 1;

    -- current_participantsではなく、実際の予約から直接カウント
    -- 対象: pending, confirmed, gm_confirmed, checked_in（キャンセル・no_show・completed は除外）
    SELECT COALESCE(SUM(r.participant_count), 0)
    INTO v_current
    FROM reservations r
    WHERE r.schedule_event_id = v_event.id
      AND r.status IN ('pending', 'confirmed', 'gm_confirmed', 'checked_in');

    v_max := v_event.max_participants;

    RAISE NOTICE '👥 参加者数（実予約カウント）: %/% (event_id=%)',
      v_current, v_max, v_event.id;

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

  RAISE NOTICE '✅ 4時間前チェック完了: checked=%, confirmed=%, cancelled=%',
    v_events_checked, v_events_confirmed, v_events_cancelled;

  RETURN QUERY SELECT
    v_events_checked,
    v_events_confirmed,
    v_events_cancelled,
    v_details;
END;
$$;

COMMENT ON FUNCTION check_performances_four_hours_before() IS
'4時間前に実行する公演中止判定（延長されたオープン公演のみ、実際の予約数を直接カウントして判定）';

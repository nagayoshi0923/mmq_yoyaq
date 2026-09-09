CREATE OR REPLACE FUNCTION check_performances_with_recruitment_deadlines_for_org(p_organization_id uuid)
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
  v_min INTEGER;
  v_result TEXT;
  v_now TIMESTAMPTZ;
  v_check_time TIMESTAMPTZ;
  v_deadline timestamptz;
  v_active boolean;
  v_has_decision boolean;
  v_prior_confirmed boolean;
  v_has_deadline boolean;
  v_status text;
  v_cycle integer;
  v_reopened boolean;
BEGIN
  v_now := NOW();
  v_check_time := v_now + INTERVAL '4 hours';

  FOR v_event IN
    SELECT
      se.id,
      se.date,
      se.start_time,
      se.scenario,
      se.gm_roles,
      se.is_recruitment_extended,
      (pol.one_seat_enabled AND COALESCE(os.recruitment_extension_enabled,true)) AS one_seat_enabled,
      COALESCE(rd.max_missing_participants,os.recruitment_max_missing,pol.max_missing_participants,2) AS max_missing_participants,
      COALESCE(os.recruitment_deadline_minutes,90) AS deadline_minutes,
      pol.customer_site_url,
      rd.deadline AS recruitment_deadline,
      rd.status AS recruitment_status,
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
        -- min が一切設定されていない場合のみ旧仕様（定員の過半数）にフォールバック
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
      st.name AS store_name,
      (se.date::text || ' ' || se.start_time::text || '+09:00')::timestamptz AS event_datetime
    FROM schedule_events se
    LEFT JOIN performance_recruitment_policies pol ON pol.organization_id=se.organization_id
    LEFT JOIN performance_recruitment_deadlines rd ON rd.schedule_event_id = se.id
      AND rd.organization_id = se.organization_id
    LEFT JOIN LATERAL (SELECT sc.* FROM organization_scenarios sc WHERE sc.organization_id=se.organization_id AND
      ((se.organization_scenario_id IS NOT NULL AND sc.id=se.organization_scenario_id) OR
       (se.organization_scenario_id IS NULL AND sc.scenario_master_id=COALESCE(se.scenario_master_id,se.scenario_id))) LIMIT 1) os ON true
    LEFT JOIN scenario_masters sm ON os.scenario_master_id = sm.id
    LEFT JOIN scenario_masters sm2 ON se.scenario_master_id = sm2.id
    LEFT JOIN scenarios s ON se.scenario_id = s.id
    LEFT JOIN stores st ON se.store_id = st.id
    WHERE (p_organization_id IS NULL OR se.organization_id=p_organization_id)
      AND (se.is_recruitment_extended = TRUE OR (pol.one_seat_enabled AND EXISTS(SELECT 1 FROM performance_cancellation_logs c WHERE c.schedule_event_id=se.id AND c.result='confirmed')))
      AND se.is_cancelled = FALSE
      AND se.category = 'open'
      AND se.scenario IS NOT NULL
      AND se.scenario != ''
      AND (se.date::text || ' ' || se.start_time::text || '+09:00')::timestamptz <= v_check_time
      AND ((se.date::text || ' ' || se.start_time::text || '+09:00')::timestamptz > v_now
        OR rd.status = 'active')
      AND (rd.status = 'active' OR pol.one_seat_enabled OR NOT EXISTS (
        SELECT 1 FROM performance_cancellation_logs pcl
        WHERE pcl.schedule_event_id = se.id
          AND pcl.check_type = 'four_hours_before'
      )
      )
    ORDER BY se.date, se.start_time
    FOR UPDATE OF se SKIP LOCKED
  LOOP
    -- 公演ロックの取得直前に延長設定が完了した場合も、新しい文のスナップショットで再読込。
    SELECT deadline, status = 'active', status, cycle INTO v_deadline, v_active, v_status, v_cycle
      FROM performance_recruitment_deadlines
      WHERE schedule_event_id = v_event.id AND organization_id = v_event.organization_id;
    v_has_deadline := FOUND;
    v_cycle := COALESCE(v_cycle, 1);
    v_reopened := false;
    SELECT EXISTS(SELECT 1 FROM performance_cancellation_logs WHERE schedule_event_id=v_event.id AND check_type='four_hours_before'),
      EXISTS(SELECT 1 FROM performance_cancellation_logs WHERE schedule_event_id=v_event.id AND result='confirmed')
      INTO v_has_decision, v_prior_confirmed;

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

    -- 最低開催人数は 1 以上・定員以下に収める（データ不整合で中止が暴発しないようにする）
    v_min := GREATEST(COALESCE(v_event.min_participants, 1), 1);
    IF v_min > v_max THEN
      v_min := GREATEST(v_max, 1);
    END IF;

    -- 再確定後の再欠員は同じ案内済み期限で再開。通知と辞退リンクは周回別に保持。
    IF v_status = 'confirmed'
      AND v_min-v_current BETWEEN 1 AND v_event.max_missing_participants THEN
      UPDATE performance_recruitment_deadlines SET status='active', cycle=cycle+1,
        was_confirmed=true, updated_at=now()
        WHERE schedule_event_id=v_event.id AND organization_id=v_event.organization_id
        RETURNING cycle INTO v_cycle;
      UPDATE schedule_events SET is_recruitment_extended=true, updated_at=now()
        WHERE id=v_event.id AND organization_id=v_event.organization_id;
      v_active := true;
      v_reopened := true;
      -- 旧周回の未送信通知は新しい状態へ持ち越さない。送信済み履歴は保持する。
      UPDATE performance_recruitment_notices SET status='expired', lease_until=NULL
        WHERE schedule_event_id=v_event.id AND organization_id=v_event.organization_id
          AND cycle<v_cycle AND kind<>'withdrawn' AND status IN ('pending','failed','sending');
    END IF;

    -- 社長確認済み: 最低開催人数まであと1〜2人なら、予約の増加履歴によらず90分前まで（組織設定で段階適用）。
    IF (v_reopened AND v_deadline>v_now) OR (v_event.one_seat_enabled AND NOT v_has_deadline
      AND v_min-v_current BETWEEN 1 AND v_event.max_missing_participants
      AND v_event.event_datetime - make_interval(mins=>v_event.deadline_minutes) > v_now) THEN
      IF NOT v_reopened THEN
      PERFORM set_performance_recruitment_deadline(v_event.organization_id,v_event.id,
        v_event.event_datetime-make_interval(mins=>v_event.deadline_minutes),format('最低開催人数まであと%s人のため、開始%s分前まで追加募集',v_min-v_current,v_event.deadline_minutes));
        v_deadline := v_event.event_datetime-make_interval(mins=>v_event.deadline_minutes);
        UPDATE performance_recruitment_deadlines SET max_missing_participants=v_event.max_missing_participants WHERE schedule_event_id=v_event.id AND organization_id=v_event.organization_id;
      END IF;
      INSERT INTO performance_recruitment_notices(schedule_event_id,organization_id,reservation_id,customer_email,snapshot,cycle)
      SELECT v_event.id,v_event.organization_id,r.id,COALESCE(NULLIF(btrim(r.customer_email),''),NULLIF(btrim(c.email),'')),
        jsonb_build_object('scenario',v_event.scenario,'date',v_event.date,'start_time',v_event.start_time,
          'store_name',v_event.store_name,'deadline',v_deadline,
          'was_confirmed',v_prior_confirmed,'site_url',v_event.customer_site_url,'missing_participants',v_min-v_current),v_cycle
      FROM reservations r LEFT JOIN customers c ON c.id=r.customer_id
      WHERE r.schedule_event_id=v_event.id AND r.organization_id=v_event.organization_id
        AND r.status IN ('pending','confirmed','gm_confirmed') AND r.reservation_source IS DISTINCT FROM 'staff_entry'
      ON CONFLICT(schedule_event_id,reservation_id,kind,cycle,withdrawal_sequence) DO NOTHING;
      CONTINUE;
    END IF;
    -- 確定済みの公演を毎分再確定しない。設定を超える欠員は今回の自動延長ルールに含めない。
    IF v_active IS NOT TRUE AND (v_has_decision OR v_event.is_recruitment_extended IS NOT TRUE) THEN CONTINUE; END IF;

    -- 人数が揃えば即確定。未達でも指定締切前は終端ログ・通知を作らない。
    IF v_current < v_min AND v_active AND v_deadline > v_now THEN CONTINUE; END IF;
    v_events_checked := v_events_checked + 1;

    IF v_current >= v_min THEN
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

    IF v_active THEN
      -- 最終通知も同じトランザクションで確保。過去の開催決定メールとは別に送る。
      INSERT INTO performance_recruitment_notices(schedule_event_id,organization_id,reservation_id,customer_email,snapshot,kind,cycle)
      SELECT v_event.id,v_event.organization_id,r.id,COALESCE(NULLIF(btrim(r.customer_email),''),NULLIF(btrim(c.email),'')),
        jsonb_build_object('scenario',v_event.scenario,'date',v_event.date,'start_time',v_event.start_time,
          'store_name',v_event.store_name,'deadline',v_deadline,'was_confirmed',v_prior_confirmed,'site_url',v_event.customer_site_url),v_result,v_cycle
      FROM reservations r LEFT JOIN customers c ON c.id=r.customer_id
      WHERE r.schedule_event_id=v_event.id AND r.organization_id=v_event.organization_id
        AND r.status IN ('pending','confirmed','gm_confirmed') AND r.reservation_source IS DISTINCT FROM 'staff_entry'
      ON CONFLICT(schedule_event_id,reservation_id,kind,cycle,withdrawal_sequence) DO NOTHING;
      IF v_result='cancelled' THEN
        UPDATE reservations SET status='cancelled',cancelled_at=now(),updated_at=now(),
          cancellation_reason='人数未達による公演中止（追加募集期限の判定・キャンセル料0円）'
          WHERE schedule_event_id=v_event.id AND organization_id=v_event.organization_id AND status IN ('pending','confirmed','gm_confirmed');
      END IF;
      UPDATE performance_recruitment_deadlines SET status = v_result, updated_at = now()
        WHERE schedule_event_id = v_event.id AND organization_id = v_event.organization_id;
    END IF;

    -- 以前の開催決定を保持する。追加募集の最終結果は期限テーブルにも残る。
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
    ) ON CONFLICT (schedule_event_id, check_type) DO NOTHING;

    v_details := v_details || jsonb_build_object(
      'recruitment_deadline', CASE WHEN v_active THEN v_deadline ELSE NULL END,
      'event_id', v_event.id,
      'date', v_event.date,
      'start_time', v_event.start_time,
      'scenario', v_event.scenario,
      'store_name', v_event.store_name,
      'current_participants', v_current,
      'max_participants', v_max,
      'min_required', v_min,
      -- half_required は旧キーの後方互換（値は min_required と同じ）
      'half_required', v_min,
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

ALTER FUNCTION public.check_performances_with_recruitment_deadlines_for_org(uuid) SET timezone TO 'Asia/Tokyo';
REVOKE ALL ON FUNCTION public.check_performances_with_recruitment_deadlines_for_org(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.check_performances_with_recruitment_deadlines_for_org(uuid) TO service_role;

-- 既存cronの呼び出しを維持。毎分処理は組織を指定した本体だけを使う。
CREATE OR REPLACE FUNCTION public.check_performances_with_recruitment_deadlines()
RETURNS TABLE(events_checked integer, events_confirmed integer, events_cancelled integer, details jsonb)
LANGUAGE sql SECURITY DEFINER SET search_path=public AS $$
 SELECT * FROM public.check_performances_with_recruitment_deadlines_for_org(NULL);
$$;
REVOKE ALL ON FUNCTION public.check_performances_with_recruitment_deadlines() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.check_performances_with_recruitment_deadlines() TO service_role;

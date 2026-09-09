-- QW-20260907-005: 既存RPCは保持。DB適用後にEdgeを切り替える。
-- 内部の判断理由は公開 schedule_events に保存しない。
CREATE TABLE public.performance_recruitment_deadlines (
  schedule_event_id uuid PRIMARY KEY REFERENCES public.schedule_events(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES public.organizations(id),
  deadline timestamptz NOT NULL,
  reason text NOT NULL CHECK (length(btrim(reason)) BETWEEN 1 AND 2000),
  was_confirmed boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'confirmed', 'cancelled')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.performance_recruitment_deadlines ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.performance_recruitment_deadlines FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.performance_recruitment_deadlines TO service_role;

-- 管理 API / AI Manager のサーバーからのみ実行。締切の既定値は設けない。
CREATE FUNCTION public.set_performance_recruitment_deadline(
  p_organization_id uuid, p_event_id uuid, p_deadline timestamptz, p_reason text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_event public.schedule_events%ROWTYPE;
  v_existing public.performance_recruitment_deadlines%ROWTYPE;
  v_start timestamptz;
  v_confirmed boolean;
BEGIN
  SELECT * INTO v_event FROM public.schedule_events
  WHERE id = p_event_id AND organization_id = p_organization_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION '対象の公演が見つかりません' USING ERRCODE = '22023'; END IF;
  v_start := (v_event.date + v_event.start_time) AT TIME ZONE 'Asia/Tokyo';
  IF v_event.category <> 'open' OR v_event.is_cancelled IS DISTINCT FROM false THEN
    RAISE EXCEPTION '中止していないオープン公演のみ延長できます' USING ERRCODE = '22023';
  END IF;
  IF p_deadline IS NULL OR p_deadline <= now() OR p_deadline >= v_start OR p_deadline < v_start - interval '4 hours' THEN
    RAISE EXCEPTION '締切は現在より後かつ公演4時間前以降、公演開始より前を指定してください' USING ERRCODE = '22023';
  END IF;
  IF p_reason IS NULL OR length(btrim(p_reason)) NOT BETWEEN 1 AND 2000 THEN
    RAISE EXCEPTION '延長理由を1〜2000文字で指定してください' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_existing FROM public.performance_recruitment_deadlines WHERE schedule_event_id = p_event_id;
  IF FOUND THEN
    -- 再送は同じ結果を返す。顧客に案内した期限の黙示的な変更はしない。
    IF v_existing.status = 'active' AND v_existing.deadline = p_deadline
      AND v_existing.reason = btrim(p_reason) THEN
      RETURN jsonb_build_object('success', true, 'deadline', v_existing.deadline,
        'was_confirmed', v_existing.was_confirmed, 'replayed', true);
    END IF;
    RAISE EXCEPTION '既存の延長判断があります。期限の変更には顧客案内の再確認が必要です' USING ERRCODE = '22023';
  END IF;
  SELECT EXISTS(SELECT 1 FROM public.performance_cancellation_logs
    WHERE schedule_event_id = p_event_id AND organization_id = p_organization_id
      AND result = 'confirmed') INTO v_confirmed;
  INSERT INTO public.performance_recruitment_deadlines
    (schedule_event_id, organization_id, deadline, reason, was_confirmed)
    VALUES (p_event_id, p_organization_id, p_deadline, btrim(p_reason), v_confirmed);
  UPDATE public.schedule_events SET is_recruitment_extended = true, updated_at = now()
    WHERE id = p_event_id AND organization_id = p_organization_id;
  RETURN jsonb_build_object('success', true, 'deadline', p_deadline,
    'was_confirmed', v_confirmed, 'replayed', false);
END;
$$;
REVOKE ALL ON FUNCTION public.set_performance_recruitment_deadline(uuid, uuid, timestamptz, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_performance_recruitment_deadline(uuid, uuid, timestamptz, text) TO service_role;

CREATE FUNCTION check_performances_with_recruitment_deadlines()
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
    LEFT JOIN performance_recruitment_deadlines rd ON rd.schedule_event_id = se.id
      AND rd.organization_id = se.organization_id AND rd.status = 'active' 
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
      AND ((se.date::text || ' ' || se.start_time::text || '+09:00')::timestamptz > v_now
        OR rd.status = 'active')
      AND (rd.status = 'active' OR NOT EXISTS (
        SELECT 1 FROM performance_cancellation_logs pcl
        WHERE pcl.schedule_event_id = se.id
          AND pcl.check_type = 'four_hours_before'
      )
      )
    ORDER BY se.date, se.start_time
    FOR UPDATE OF se SKIP LOCKED
  LOOP
    -- 公演ロックの取得直前に延長設定が完了した場合も、新しい文のスナップショットで再読込。
    SELECT deadline, status = 'active' INTO v_deadline, v_active
      FROM performance_recruitment_deadlines
      WHERE schedule_event_id = v_event.id AND organization_id = v_event.organization_id;
    IF v_active IS NOT TRUE AND EXISTS (
      SELECT 1 FROM performance_cancellation_logs
      WHERE schedule_event_id = v_event.id AND check_type = 'four_hours_before'
    ) THEN CONTINUE; END IF;

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

COMMENT ON FUNCTION check_performances_with_recruitment_deadlines() IS
'4時間前に実行する公演中止判定（募集延長のみ・最低開催人数以上で開催確定・未満で中止・定員と最低人数はorganization_scenarios反映）';

ALTER FUNCTION check_performances_with_recruitment_deadlines() SET timezone TO 'Asia/Tokyo';

REVOKE ALL ON FUNCTION public.check_performances_with_recruitment_deadlines() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.check_performances_with_recruitment_deadlines() TO service_role;

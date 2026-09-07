CREATE TABLE public.performance_recruitment_policies (
 organization_id uuid PRIMARY KEY REFERENCES public.organizations(id),
 one_seat_enabled boolean NOT NULL DEFAULT false,
 customer_site_url text NOT NULL CHECK (customer_site_url ~ '^https://'),
 updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.performance_recruitment_policies ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.performance_recruitment_policies FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.performance_recruitment_policies TO service_role;

CREATE TABLE public.performance_recruitment_notices (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 schedule_event_id uuid NOT NULL REFERENCES public.performance_recruitment_deadlines(schedule_event_id),
 organization_id uuid NOT NULL REFERENCES public.organizations(id),
 reservation_id uuid NOT NULL REFERENCES public.reservations(id),
 response_token uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(),
 customer_email text,
 kind text NOT NULL DEFAULT 'extension' CHECK(kind IN ('extension','confirmed','cancelled','withdrawn')),
 snapshot jsonb NOT NULL,
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','sending','sent','failed','expired')),
 attempts integer NOT NULL DEFAULT 0,
 lease_until timestamptz,
 sent_at timestamptz,
 withdrawn_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(schedule_event_id, reservation_id, kind)
);
ALTER TABLE public.performance_recruitment_notices ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.performance_recruitment_notices FROM PUBLIC, anon, authenticated;
GRANT SELECT, UPDATE, INSERT ON public.performance_recruitment_notices TO service_role;
CREATE INDEX performance_recruitment_notices_pending ON public.performance_recruitment_notices(status, lease_until);


-- 通知の同時送信を避け、通信断後は同じ冪等性キーで再試行する。
CREATE FUNCTION public.claim_performance_recruitment_notices() RETURNS SETOF public.performance_recruitment_notices
LANGUAGE sql SECURITY DEFINER SET search_path=public AS $$
 UPDATE performance_recruitment_notices n SET status='sending', attempts=attempts+1, lease_until=now()+interval '5 minutes'
 WHERE id IN (SELECT q.id FROM performance_recruitment_notices q
   JOIN performance_recruitment_deadlines d ON d.schedule_event_id=q.schedule_event_id AND d.organization_id=q.organization_id
   WHERE (q.status IN ('pending','failed') OR (q.status='sending' AND q.lease_until<now()))
     AND (q.lease_until IS NULL OR q.lease_until<now()) AND q.attempts<10
     AND ((q.kind='extension' AND d.status='active' AND d.deadline>now() AND q.withdrawn_at IS NULL)
       OR (q.kind IN ('confirmed','cancelled') AND d.status=q.kind AND q.created_at>now()-interval '1 day')
       OR (q.kind='withdrawn' AND q.created_at>now()-interval '1 day'))
   ORDER BY q.created_at LIMIT 25 FOR UPDATE OF q SKIP LOCKED)
 RETURNING n.*;
$$;
REVOKE ALL ON FUNCTION public.claim_performance_recruitment_notices() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_performance_recruitment_notices() TO service_role;

-- メール内の推測不能な専用トークンだけで利用する。GETでは予約を変更しない。
CREATE FUNCTION public.respond_to_performance_recruitment(p_token uuid, p_withdraw boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE n performance_recruitment_notices%ROWTYPE; d performance_recruitment_deadlines%ROWTYPE; e schedule_events%ROWTYPE; r reservations%ROWTYPE;
BEGIN
 SELECT * INTO n FROM performance_recruitment_notices WHERE response_token=p_token AND kind='extension';
 IF NOT FOUND THEN RETURN jsonb_build_object('success',false,'error','INVALID_LINK'); END IF;
 -- 判定処理とロック順を合わせる（公演→予約→通知）。
 SELECT * INTO e FROM schedule_events WHERE id=n.schedule_event_id AND organization_id=n.organization_id FOR UPDATE;
 SELECT * INTO r FROM reservations WHERE id=n.reservation_id AND organization_id=n.organization_id AND schedule_event_id=n.schedule_event_id FOR UPDATE;
 IF NOT FOUND THEN RETURN jsonb_build_object('success',false,'error','INVALID_LINK'); END IF;
 SELECT * INTO n FROM performance_recruitment_notices WHERE response_token=p_token AND kind='extension' FOR UPDATE;
 SELECT * INTO d FROM performance_recruitment_deadlines WHERE schedule_event_id=n.schedule_event_id AND organization_id=n.organization_id;
 IF n.withdrawn_at IS NOT NULL THEN RETURN jsonb_build_object('success',true,'status','withdrawn','cancellation_fee',0,'event',n.snapshot); END IF;
 IF p_withdraw THEN
   IF d.status IS DISTINCT FROM 'active' OR now()>=d.deadline OR e.is_cancelled OR r.status NOT IN ('pending','confirmed','gm_confirmed') THEN
     RETURN jsonb_build_object('success',false,'error','WITHDRAWAL_CLOSED');
   END IF;
   UPDATE reservations SET status='cancelled', cancelled_at=now(),
     cancellation_reason='追加募集の開催判断待ちによる無料辞退（キャンセル料0円）', updated_at=now()
     WHERE id=r.id AND organization_id=n.organization_id;
   UPDATE performance_recruitment_notices SET withdrawn_at=now() WHERE id=n.id;
   INSERT INTO performance_recruitment_notices(schedule_event_id,organization_id,reservation_id,customer_email,snapshot,kind)
     VALUES(n.schedule_event_id,n.organization_id,n.reservation_id,n.customer_email,n.snapshot,'withdrawn')
     ON CONFLICT(schedule_event_id,reservation_id,kind) DO NOTHING;
   UPDATE schedule_events SET current_participants=(SELECT COALESCE(sum(participant_count),0) FROM reservations
     WHERE schedule_event_id=e.id AND organization_id=e.organization_id AND status IN ('pending','confirmed','gm_confirmed','checked_in')),
     updated_at=now() WHERE id=e.id;
   RETURN jsonb_build_object('success',true,'status','withdrawn','cancellation_fee',0,'event',n.snapshot);
 END IF;
 RETURN jsonb_build_object('success',true,'status',d.status,'event',n.snapshot,
   'can_withdraw', d.status='active' AND now()<d.deadline AND NOT e.is_cancelled AND r.status IN ('pending','confirmed','gm_confirmed'));
END;
$$;
REVOKE ALL ON FUNCTION public.respond_to_performance_recruitment(uuid,boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.respond_to_performance_recruitment(uuid,boolean) TO service_role;


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
      pol.one_seat_enabled,
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
      AND rd.organization_id = se.organization_id AND rd.status = 'active'
    LEFT JOIN organization_scenarios os ON se.organization_scenario_id = os.id
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
    SELECT deadline, status = 'active' INTO v_deadline, v_active
      FROM performance_recruitment_deadlines
      WHERE schedule_event_id = v_event.id AND organization_id = v_event.organization_id;
    v_has_deadline := FOUND;
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

    -- 社長確認済み: 最低開催人数まであと1人なら、予約の増加履歴によらず90分前まで。
    IF v_event.one_seat_enabled AND NOT v_has_deadline AND v_min-v_current=1
      AND v_event.event_datetime - interval '90 minutes' > v_now THEN
      PERFORM set_performance_recruitment_deadline(v_event.organization_id,v_event.id,
        v_event.event_datetime-interval '90 minutes','最低開催人数まであと1人のため、開始90分前まで追加募集');
      INSERT INTO performance_recruitment_notices(schedule_event_id,organization_id,reservation_id,customer_email,snapshot)
      SELECT v_event.id,v_event.organization_id,r.id,COALESCE(NULLIF(btrim(r.customer_email),''),NULLIF(btrim(c.email),'')),
        jsonb_build_object('scenario',v_event.scenario,'date',v_event.date,'start_time',v_event.start_time,
          'store_name',v_event.store_name,'deadline',v_event.event_datetime-interval '90 minutes',
          'was_confirmed',v_prior_confirmed,'site_url',v_event.customer_site_url)
      FROM reservations r LEFT JOIN customers c ON c.id=r.customer_id
      WHERE r.schedule_event_id=v_event.id AND r.organization_id=v_event.organization_id
        AND r.status IN ('pending','confirmed','gm_confirmed') AND r.reservation_source IS DISTINCT FROM 'staff_entry'
      ON CONFLICT(schedule_event_id,reservation_id,kind) DO NOTHING;
      CONTINUE;
    END IF;
    -- 確定済みの公演を毎分再確定しない。2人以上の欠員は今回の自動延長ルールに含めない。
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
      INSERT INTO performance_recruitment_notices(schedule_event_id,organization_id,reservation_id,customer_email,snapshot,kind)
      SELECT v_event.id,v_event.organization_id,r.id,COALESCE(NULLIF(btrim(r.customer_email),''),NULLIF(btrim(c.email),'')),
        jsonb_build_object('scenario',v_event.scenario,'date',v_event.date,'start_time',v_event.start_time,
          'store_name',v_event.store_name,'deadline',v_deadline,'was_confirmed',v_prior_confirmed,'site_url',v_event.customer_site_url),v_result
      FROM reservations r LEFT JOIN customers c ON c.id=r.customer_id
      WHERE r.schedule_event_id=v_event.id AND r.organization_id=v_event.organization_id
        AND r.status IN ('pending','confirmed','gm_confirmed') AND r.reservation_source IS DISTINCT FROM 'staff_entry'
      ON CONFLICT(schedule_event_id,reservation_id,kind) DO NOTHING;
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


-- 有効化した組織だけを毎分判定する。接続先・認証情報は既存の環境別設定を使う。
CREATE OR REPLACE FUNCTION public.dispatch_performance_recruitment_checks() RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE p record; base_url text; cron_key text;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM performance_recruitment_policies WHERE one_seat_enabled) THEN RETURN; END IF;
 SELECT value INTO base_url FROM app_config WHERE key='supabase_url';
 SELECT value INTO cron_key FROM app_config WHERE key='trigger_secret';
 IF base_url IS NULL OR cron_key IS NULL THEN RAISE EXCEPTION '募集判定の接続設定がありません'; END IF;
 FOR p IN SELECT organization_id FROM performance_recruitment_policies pol WHERE one_seat_enabled
   AND (EXISTS(SELECT 1 FROM schedule_events e WHERE e.organization_id=pol.organization_id
     AND NOT e.is_cancelled AND e.category='open'
     AND (e.date+e.start_time) AT TIME ZONE 'Asia/Tokyo' <= now()+interval '4 hours'
     AND ((e.date+e.start_time) AT TIME ZONE 'Asia/Tokyo'>now()
       OR EXISTS(SELECT 1 FROM performance_recruitment_deadlines d WHERE d.schedule_event_id=e.id AND d.status='active')))
     OR EXISTS(SELECT 1 FROM performance_recruitment_notices n WHERE n.organization_id=pol.organization_id
       AND n.kind<>'extension' AND n.status IN ('pending','failed','sending') AND n.attempts<10 AND n.created_at>now()-interval '1 day'))
 LOOP
   PERFORM net.http_post(url:=rtrim(base_url,'/')||'/functions/v1/check-performance-cancellation',
     headers:=jsonb_build_object('Content-Type','application/json','x-recruitment-cron-secret',cron_key),
     body:=jsonb_build_object('check_type','recruitment_deadline','organization_id',p.organization_id), timeout_milliseconds:=30000);
 END LOOP;
END;
$$;
REVOKE ALL ON FUNCTION public.dispatch_performance_recruitment_checks() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.dispatch_performance_recruitment_checks() TO service_role;


CREATE FUNCTION public.get_performance_recruitment_deadline(p_event_id uuid)
RETURNS TABLE(deadline timestamptz) LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT d.deadline FROM performance_recruitment_deadlines d JOIN schedule_events e ON e.id=d.schedule_event_id AND e.organization_id=d.organization_id
 WHERE e.id=p_event_id AND e.category='open' AND NOT e.is_cancelled AND d.status='active';
$$;
REVOKE ALL ON FUNCTION public.get_performance_recruitment_deadline(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_performance_recruitment_deadline(uuid) TO anon, authenticated, service_role;

-- cronが次に動くまでの数秒にも、期限を過ぎた追加予約は受け付けない。
CREATE FUNCTION public.enforce_performance_recruitment_booking() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE deadline_at timestamptz;
BEGIN
 IF NEW.status NOT IN ('pending','confirmed','gm_confirmed','checked_in') THEN RETURN NEW; END IF;
 IF TG_OP='UPDATE' AND NEW.schedule_event_id IS NOT DISTINCT FROM OLD.schedule_event_id
   AND OLD.status IN ('pending','confirmed','gm_confirmed','checked_in') AND NEW.participant_count<=OLD.participant_count THEN RETURN NEW; END IF;
 PERFORM 1 FROM schedule_events WHERE id=NEW.schedule_event_id FOR UPDATE;
 SELECT deadline INTO deadline_at FROM performance_recruitment_deadlines WHERE schedule_event_id=NEW.schedule_event_id AND status='active';
 IF deadline_at IS NOT NULL AND now()>=deadline_at THEN RAISE EXCEPTION '追加募集の受付期限を過ぎています' USING ERRCODE='22023'; END IF;
 RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.enforce_performance_recruitment_booking() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER enforce_performance_recruitment_booking BEFORE INSERT OR UPDATE OF schedule_event_id,status,participant_count ON public.reservations
FOR EACH ROW EXECUTE FUNCTION public.enforce_performance_recruitment_booking();

SELECT cron.schedule('performance-recruitment-minute', '* * * * *', 'SELECT public.dispatch_performance_recruitment_checks()');

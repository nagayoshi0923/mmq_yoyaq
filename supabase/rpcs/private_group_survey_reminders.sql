-- 正本: migration 20261006110000（事前配役アンケートのリマインドメール）
-- 送る対象（参加中・日程確定・公演前・アンケート有効・外部の回答先なし・未回答・締切前）
CREATE OR REPLACE FUNCTION public.private_group_survey_reminder_targets()
RETURNS TABLE(organization_id uuid, group_id uuid, member_id uuid, deadline_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
  SELECT g.organization_id, g.id, m.id, (s.settings->>'survey_deadline_at')::timestamptz
    FROM public.private_group_members m
    JOIN public.private_groups g ON g.id=m.group_id
    JOIN public.reservations r ON r.id=g.reservation_id AND r.organization_id=g.organization_id
    JOIN public.schedule_events e ON e.id=r.schedule_event_id AND e.organization_id=g.organization_id
    CROSS JOIN LATERAL (SELECT public.get_private_group_survey_settings(g.organization_id, g.id) AS settings) s
   WHERE m.status='joined' AND g.status='confirmed' AND r.status IN ('confirmed','gm_confirmed')
     AND e.date > (clock_timestamp() AT TIME ZONE 'Asia/Tokyo')::date
     AND COALESCE((s.settings->>'survey_enabled')::boolean,false)
     AND COALESCE(s.settings->>'survey_url','')=''
     AND (s.settings->>'survey_deadline_at')::timestamptz > clock_timestamp()
     AND NOT EXISTS (SELECT 1 FROM public.private_group_survey_responses x WHERE x.member_id=m.id AND x.group_id=g.id)
$$;
REVOKE ALL ON FUNCTION public.private_group_survey_reminder_targets() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.private_group_survey_reminder_targets() TO service_role;

CREATE OR REPLACE FUNCTION public.enqueue_private_group_survey_reminders(p_kind text)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_today date := (clock_timestamp() AT TIME ZONE 'Asia/Tokyo')::date; n integer;
BEGIN
  IF p_kind NOT IN ('manual','deadline_7d','deadline_1d') THEN RAISE EXCEPTION '種類が正しくありません' USING ERRCODE='22023'; END IF;
  INSERT INTO public.private_group_survey_reminders(organization_id, group_id, member_id, kind, deadline_at)
  SELECT t.organization_id, t.group_id, t.member_id, p_kind, t.deadline_at FROM public.private_group_survey_reminder_targets() t
   WHERE p_kind='manual'
      OR (p_kind='deadline_7d' AND (t.deadline_at AT TIME ZONE 'Asia/Tokyo')::date = v_today + 7)
      OR (p_kind='deadline_1d' AND (t.deadline_at AT TIME ZONE 'Asia/Tokyo')::date = v_today + 1)
  ON CONFLICT (member_id, kind, deadline_at) WHERE kind<>'preview' DO NOTHING;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END $$;
REVOKE ALL ON FUNCTION public.enqueue_private_group_survey_reminders(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.enqueue_private_group_survey_reminders(text) TO service_role;

-- 試し送り: 対象の 1 人分の文面を、指定の宛先へ 1 通だけ送る
CREATE OR REPLACE FUNCTION public.enqueue_private_group_survey_reminder_preview(p_member_id uuid, p_to_email text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v record; v_id uuid;
BEGIN
  IF p_to_email IS NULL OR p_to_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' THEN RAISE EXCEPTION '宛先が正しくありません' USING ERRCODE='22023'; END IF;
  SELECT * INTO v FROM public.private_group_survey_reminder_targets() t WHERE t.member_id=p_member_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'リマインドの対象ではありません' USING ERRCODE='22023'; END IF;
  INSERT INTO public.private_group_survey_reminders(organization_id, group_id, member_id, kind, deadline_at, to_email_override)
  VALUES (v.organization_id, v.group_id, v.member_id, 'preview', v.deadline_at, p_to_email) RETURNING id INTO v_id;
  RETURN v_id;
END $$;
REVOKE ALL ON FUNCTION public.enqueue_private_group_survey_reminder_preview(uuid,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.enqueue_private_group_survey_reminder_preview(uuid,text) TO service_role;

-- 送信処理が取り出す。取り出す時点で回答済みなら送らずに skipped にする
CREATE OR REPLACE FUNCTION public.claim_private_group_survey_reminders(p_limit integer DEFAULT 20)
RETURNS TABLE(id uuid, organization_id uuid, kind text, to_email text, to_name text, scenario_title text, performance_date date, start_time time,
              venue text, deadline_at timestamptz, invite_code text, company_name text, reply_to text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
  UPDATE public.private_group_survey_reminders q SET status='skipped', last_error='answered_before_send', lease_until=NULL
   WHERE q.status='pending' AND q.kind<>'preview'
     AND EXISTS (SELECT 1 FROM public.private_group_survey_responses x WHERE x.member_id=q.member_id AND x.group_id=q.group_id);
  RETURN QUERY
  WITH picked AS (
    SELECT q.id FROM public.private_group_survey_reminders q
     WHERE (q.status='pending' OR (q.status='sending' AND q.lease_until<clock_timestamp())) AND q.next_attempt_at<=clock_timestamp() AND q.attempt_count<5
     ORDER BY q.next_attempt_at, q.id LIMIT LEAST(GREATEST(COALESCE(p_limit,20),1),50) FOR UPDATE SKIP LOCKED
  ), leased AS (
    UPDATE public.private_group_survey_reminders q SET status='sending', attempt_count=q.attempt_count+1, lease_until=clock_timestamp()+interval '10 minutes'
      FROM picked WHERE q.id=picked.id RETURNING q.*
  )
  SELECT l.id, l.organization_id, l.kind,
         COALESCE(l.to_email_override, NULLIF(pii.guest_email,''), au.email)::text,
         COALESCE(CASE WHEN m.user_id IS NULL THEN pii.guest_name END,
                  (SELECT COALESCE(NULLIF(c.name,''),NULLIF(c.nickname,'')) FROM public.customers c WHERE c.user_id=m.user_id ORDER BY c.id LIMIT 1), 'お客')::text,
         sm.title::text, e.date, e.start_time, st.name::text, l.deadline_at, g.invite_code::text,
         COALESCE(NULLIF(es.company_name,''), NULLIF(eo.company_name,''), 'クインズワルツ')::text,
         -- 返信先: 組織の返信先 → 会場の店舗の連絡先 → 組織共通の連絡先（普段のリマインドメールと同じ順）
         COALESCE(NULLIF(os.reply_to_email,''), NULLIF(es.company_email,''), NULLIF(eo.company_email,''))::text
    FROM leased l
    JOIN public.private_group_members m ON m.id=l.member_id
    JOIN public.private_groups g ON g.id=l.group_id
    LEFT JOIN public.private_group_members_pii pii ON pii.member_id=m.id
    LEFT JOIN auth.users au ON au.id=m.user_id
    LEFT JOIN public.scenario_masters sm ON sm.id=g.scenario_master_id
    LEFT JOIN public.reservations r ON r.id=g.reservation_id
    LEFT JOIN public.schedule_events e ON e.id=r.schedule_event_id
    LEFT JOIN public.stores st ON st.id=e.store_id
    LEFT JOIN public.email_settings es ON es.organization_id=l.organization_id AND es.store_id=e.store_id
    LEFT JOIN public.email_settings eo ON eo.organization_id=l.organization_id AND eo.store_id IS NULL
    LEFT JOIN public.organization_settings os ON os.organization_id=l.organization_id;
END $$;
REVOKE ALL ON FUNCTION public.claim_private_group_survey_reminders(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_private_group_survey_reminders(integer) TO service_role;

CREATE OR REPLACE FUNCTION public.finish_private_group_survey_reminder(p_id uuid, p_ok boolean, p_provider_message_id text DEFAULT NULL, p_error text DEFAULT NULL, p_email_log_id uuid DEFAULT NULL, p_retry boolean DEFAULT true)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
  UPDATE public.private_group_survey_reminders q
     SET status = CASE WHEN p_ok THEN 'sent' WHEN p_retry AND q.attempt_count<5 THEN 'pending' ELSE 'failed' END,
         sent_at = CASE WHEN p_ok THEN clock_timestamp() ELSE q.sent_at END,
         provider_message_id = COALESCE(p_provider_message_id, q.provider_message_id),
         email_log_id = COALESCE(p_email_log_id, q.email_log_id),
         last_error = CASE WHEN p_ok THEN NULL ELSE left(p_error, 500) END,
         next_attempt_at = CASE WHEN p_ok THEN q.next_attempt_at ELSE clock_timestamp() + make_interval(mins => 5 * q.attempt_count) END,
         lease_until = NULL
   WHERE q.id=p_id AND q.status='sending';
END $$;
REVOKE ALL ON FUNCTION public.finish_private_group_survey_reminder(uuid,boolean,text,text,uuid,boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.finish_private_group_survey_reminder(uuid,boolean,text,text,uuid,boolean) TO service_role;

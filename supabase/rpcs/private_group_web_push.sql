-- 正規定義（migration 20261010130000_private_group_web_push.sql）。ウェブプッシュの購読・グループごとの ON/OFF（ブラウザから）と送信処理（send-web-push）用

CREATE OR REPLACE FUNCTION public.web_push_subscription_save(p_endpoint text, p_p256dh text, p_auth text, p_user_agent text DEFAULT NULL)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $function$
DECLARE v_uid uuid := auth.uid();
BEGIN
 IF v_uid IS NULL THEN RAISE EXCEPTION 'ログインしてください' USING ERRCODE = '42501'; END IF;
 -- 同じ端末（endpoint）は、いまログインしている人のものにする（端末で別の人に切り替えたとき前の人に届かないように）
 INSERT INTO public.web_push_subscriptions(user_id, endpoint, p256dh, auth, user_agent)
 VALUES (v_uid, btrim(p_endpoint), btrim(p_p256dh), btrim(p_auth), left(nullif(btrim(p_user_agent), ''), 300))
 ON CONFLICT (endpoint) DO UPDATE SET user_id = EXCLUDED.user_id, p256dh = EXCLUDED.p256dh, auth = EXCLUDED.auth, user_agent = EXCLUDED.user_agent;
 -- 1 人 10 台まで（古いものから消す）
 DELETE FROM public.web_push_subscriptions s WHERE s.user_id = v_uid AND s.id NOT IN (
  SELECT id FROM public.web_push_subscriptions WHERE user_id = v_uid ORDER BY coalesce(last_used_at, created_at) DESC LIMIT 10);
 RETURN jsonb_build_object('saved', true);
EXCEPTION WHEN check_violation THEN
 RAISE EXCEPTION 'この端末の通知の登録内容が正しくありません' USING ERRCODE = '22023';
END $function$;
REVOKE ALL ON FUNCTION public.web_push_subscription_save(text, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.web_push_subscription_save(text, text, text, text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.web_push_subscription_delete(p_endpoint text)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $function$
DECLARE n integer;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'ログインしてください' USING ERRCODE = '42501'; END IF;
 DELETE FROM public.web_push_subscriptions WHERE endpoint = btrim(p_endpoint) AND user_id = auth.uid();
 GET DIAGNOSTICS n = ROW_COUNT;
 RETURN jsonb_build_object('deleted', n);
END $function$;
REVOKE ALL ON FUNCTION public.web_push_subscription_delete(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.web_push_subscription_delete(text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.private_group_push_setting(p_group_id uuid, p_enabled boolean DEFAULT NULL)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $function$
DECLARE v_member uuid;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'ログインしてください' USING ERRCODE = '42501'; END IF;
 SELECT id INTO v_member FROM public.private_group_members WHERE group_id = p_group_id AND user_id = auth.uid() AND status = 'joined' LIMIT 1;
 IF v_member IS NULL THEN RAISE EXCEPTION 'このグループに参加していません' USING ERRCODE = '42501'; END IF;
 IF p_enabled IS NOT NULL THEN
  INSERT INTO public.private_group_notification_settings(group_id, member_id, push_enabled, updated_at)
  VALUES (p_group_id, v_member, p_enabled, now())
  ON CONFLICT (group_id, member_id) DO UPDATE SET push_enabled = EXCLUDED.push_enabled, updated_at = now();
 END IF;
 RETURN jsonb_build_object('push_enabled', public.web_push_group_enabled(p_group_id, v_member),
  'device_count', (SELECT count(*) FROM public.web_push_subscriptions WHERE user_id = auth.uid()));
END $function$;
REVOKE ALL ON FUNCTION public.private_group_push_setting(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.private_group_push_setting(uuid, boolean) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.web_push_claim(p_limit integer DEFAULT 50)
 RETURNS TABLE(id uuid, user_id uuid, group_id uuid, member_id uuid, kind text, title text, body text, url text, tag text,
  last_message_at timestamptz, invite_code text, attempt_count integer)
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $function$
BEGIN
 DELETE FROM public.web_push_outbox o WHERE o.created_at < clock_timestamp() - interval '7 days' AND o.status <> 'pending';
 RETURN QUERY
 WITH due AS (
  SELECT o.id FROM public.web_push_outbox o
   WHERE o.status = 'pending' AND o.send_after <= clock_timestamp() AND (o.claimed_until IS NULL OR o.claimed_until < clock_timestamp())
   ORDER BY o.send_after LIMIT least(greatest(coalesce(p_limit, 50), 1), 200) FOR UPDATE SKIP LOCKED
 ), claimed AS (
  UPDATE public.web_push_outbox o SET claimed_until = clock_timestamp() + interval '2 minutes', attempt_count = o.attempt_count + 1
    FROM due WHERE o.id = due.id
  RETURNING o.*
 )
 SELECT c.id, c.user_id, c.group_id, c.member_id, c.kind, c.title, c.body, c.url, c.tag, c.last_message_at,
        (SELECT g.invite_code FROM public.private_groups g WHERE g.id = c.group_id), c.attempt_count
   FROM claimed c ORDER BY c.send_after;
END $function$;
REVOKE ALL ON FUNCTION public.web_push_claim(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.web_push_claim(integer) TO service_role;

CREATE OR REPLACE FUNCTION public.web_push_finish(p_id uuid, p_status text, p_delivered integer DEFAULT NULL, p_reason text DEFAULT NULL, p_retry_seconds integer DEFAULT 60)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $function$
BEGIN
 IF p_status NOT IN ('sent', 'skipped', 'failed', 'retry') THEN RAISE EXCEPTION 'invalid status' USING ERRCODE = '22023'; END IF;
 UPDATE public.web_push_outbox o SET
   status = CASE WHEN p_status = 'retry' THEN CASE WHEN o.attempt_count >= 5 THEN 'failed' ELSE 'pending' END ELSE p_status END,
   send_after = CASE WHEN p_status = 'retry' THEN clock_timestamp() + make_interval(secs => least(greatest(coalesce(p_retry_seconds, 60), 5), 3600)) ELSE o.send_after END,
   claimed_until = NULL,
   delivered_count = coalesce(p_delivered, o.delivered_count),
   skip_reason = CASE WHEN p_status = 'skipped' THEN left(p_reason, 200) ELSE o.skip_reason END,
   last_error = CASE WHEN p_status IN ('failed', 'retry') THEN left(p_reason, 500) ELSE o.last_error END,
   sent_at = CASE WHEN p_status = 'sent' THEN clock_timestamp() ELSE o.sent_at END
  WHERE o.id = p_id;
END $function$;
REVOKE ALL ON FUNCTION public.web_push_finish(uuid, text, integer, text, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.web_push_finish(uuid, text, integer, text, integer) TO service_role;

CREATE OR REPLACE FUNCTION public.web_push_next_due()
 RETURNS timestamptz LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $$
  SELECT min(send_after) FROM public.web_push_outbox WHERE status = 'pending' AND claimed_until IS NULL
$$;
REVOKE ALL ON FUNCTION public.web_push_next_due() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.web_push_next_due() TO service_role;

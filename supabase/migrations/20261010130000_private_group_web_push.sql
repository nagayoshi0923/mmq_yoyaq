-- 貸切グループページ刷新 段階 3「プッシュ通知（ウェブプッシュ）」（2026-10-10、社長と決定。方針書 docs/product-spec/グループページ刷新_2026-10.md）
--
-- 外部サービスを使わない Web Push（VAPID）。送るのは Edge Function send-web-push。この migration は「何を・誰に」を決めて送信待ちに積む。
--
-- 1. 購読（端末ごと）: web_push_subscriptions。ブラウザは本人を確かめる RPC だけで保存・削除する（表には権限を付けない）。
--    送り先はブラウザのプッシュ配信元（Google・Mozilla・Apple・Microsoft）の URL だけ受け付ける（任意の URL へ送らせない）。
-- 2. グループごとの ON/OFF: private_group_notification_settings（行が無ければ ON）。本人だけ RPC で更新。
-- 3. 送信待ち: web_push_outbox。チャットの発言（30 秒以内の連続は 1 通にまとめる）・自分宛ての返信・写真、
--    通知ベルのうち「日程が確定した／店舗が申込を断った／主催者の引き継ぎ依頼／日程がそろった」。
--    発言は通知ベルに出さない（従来どおり）。自分の発言は自分に送らない。ゲスト（PIN）には送らない。
--    チャットをいま見ている人には送らない判定は、送る直前に Edge Function が既読時刻と Realtime presence で行う。
-- 4. 日程がそろった（全員が ○ の候補日ができた）: 主催者にベル＋メール、会員のメンバーにベル（＋上のプッシュ）。
-- 5. ゲスト: 毎朝 9 時（JST）に、前日からの未読の発言があればメールでまとめる（customer_notice_emails の経路）。
-- 6. 積んだら Edge Function を pg_net で呼ぶ（接続設定 app_config が無い環境では何もしない）。毎分の定期実行は取りこぼし用。
-- 通知の失敗で本来の処理（発言・回答・承認など）を止めない（各トリガーは失敗を WARNING にして続ける）。

-- ---------------------------------------------------------------------------
-- 1. 購読
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.web_push_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  endpoint text NOT NULL,
  p256dh text NOT NULL CHECK (p256dh ~ '^[A-Za-z0-9_-]{80,100}$'),
  auth text NOT NULL CHECK (auth ~ '^[A-Za-z0-9_-]{16,32}$'),
  user_agent text CHECK (user_agent IS NULL OR char_length(user_agent) <= 300),
  created_at timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz,
  CONSTRAINT web_push_subscriptions_endpoint_key UNIQUE (endpoint),
  CONSTRAINT web_push_subscriptions_endpoint_check CHECK (char_length(endpoint) <= 1024
    AND endpoint ~ '^https://(fcm\.googleapis\.com|android\.googleapis\.com|updates\.push\.services\.mozilla\.com|push\.services\.mozilla\.com|web\.push\.apple\.com|[a-z0-9-]+\.push\.apple\.com|[a-z0-9.-]+\.notify\.windows\.com)/')
);
CREATE INDEX IF NOT EXISTS idx_web_push_subscriptions_user ON public.web_push_subscriptions(user_id);
ALTER TABLE public.web_push_subscriptions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.web_push_subscriptions FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.web_push_subscriptions TO service_role;
COMMENT ON TABLE public.web_push_subscriptions IS 'ウェブプッシュの購読（端末ごと）。本人だけ RPC web_push_subscription_save / _delete で保存・削除。送信失敗（404/410）で send-web-push が消す';

-- ---------------------------------------------------------------------------
-- 2. グループごとの ON/OFF（行が無ければ ON）
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.private_group_notification_settings (
  group_id uuid NOT NULL REFERENCES public.private_groups(id) ON DELETE CASCADE,
  member_id uuid NOT NULL REFERENCES public.private_group_members(id) ON DELETE CASCADE,
  push_enabled boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (group_id, member_id)
);
CREATE INDEX IF NOT EXISTS idx_private_group_notification_settings_member ON public.private_group_notification_settings(member_id);
ALTER TABLE public.private_group_notification_settings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.private_group_notification_settings FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.private_group_notification_settings TO service_role;
COMMENT ON TABLE public.private_group_notification_settings IS '貸切グループごとのプッシュ通知の ON/OFF（行が無ければ ON）。本人だけ RPC private_group_push_setting で更新';

-- ---------------------------------------------------------------------------
-- 3. 送信待ち
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.web_push_outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  group_id uuid REFERENCES public.private_groups(id) ON DELETE CASCADE,
  member_id uuid REFERENCES public.private_group_members(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('chat', 'reply', 'notice')),
  dedupe_key text,
  message_count integer NOT NULL DEFAULT 1 CHECK (message_count >= 1),
  last_message_id uuid,
  last_message_at timestamptz,
  notification_id uuid REFERENCES public.user_notifications(id) ON DELETE SET NULL,
  title text NOT NULL,
  body text NOT NULL,
  url text NOT NULL CHECK (url ~ '^/'),
  tag text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'skipped', 'failed')),
  send_after timestamptz NOT NULL DEFAULT clock_timestamp(),
  claimed_until timestamptz,
  attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  delivered_count integer,
  skip_reason text,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  sent_at timestamptz,
  CONSTRAINT web_push_outbox_dedupe_key_key UNIQUE (dedupe_key)
);
CREATE INDEX IF NOT EXISTS idx_web_push_outbox_due ON public.web_push_outbox(send_after) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_web_push_outbox_recipient ON public.web_push_outbox(user_id, group_id, kind, status);
CREATE INDEX IF NOT EXISTS idx_web_push_outbox_created ON public.web_push_outbox(created_at);
CREATE INDEX IF NOT EXISTS idx_web_push_outbox_group ON public.web_push_outbox(group_id);
CREATE INDEX IF NOT EXISTS idx_web_push_outbox_member ON public.web_push_outbox(member_id);
CREATE INDEX IF NOT EXISTS idx_web_push_outbox_notification ON public.web_push_outbox(notification_id);
ALTER TABLE public.web_push_outbox ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.web_push_outbox FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.web_push_outbox TO service_role;
COMMENT ON TABLE public.web_push_outbox IS 'ウェブプッシュの送信待ちと結果（段階 3）。チャットは同じグループで 30 秒以内の連続を 1 通にまとめる。7 日で消す';

-- ---------------------------------------------------------------------------
-- 4. 部品
-- ---------------------------------------------------------------------------
-- 送信処理（Edge Function send-web-push）を呼ぶ。1 回の処理（トランザクション）で 1 度だけ。接続設定が無ければ何もしない
CREATE OR REPLACE FUNCTION public.web_push_kick()
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $function$
DECLARE v_url text; v_anon text; v_secret text;
BEGIN
 IF coalesce(current_setting('mmq.web_push_kicked', true), '') = '1' THEN RETURN; END IF;
 SELECT value INTO v_url FROM public.app_config WHERE key = 'supabase_url';
 SELECT value INTO v_anon FROM public.app_config WHERE key = 'supabase_anon_key';
 SELECT value INTO v_secret FROM public.app_config WHERE key = 'trigger_secret';
 IF coalesce(v_url, '') !~ '^https?://' OR coalesce(v_anon, '') = '' OR coalesce(v_secret, '') = '' OR to_regprocedure('net.http_post(text,jsonb,jsonb,jsonb,integer)') IS NULL THEN
  RETURN;
 END IF;
 PERFORM set_config('mmq.web_push_kicked', '1', true);
 PERFORM net.http_post(
  url := rtrim(v_url, '/') || '/functions/v1/send-web-push',
  body := '{}'::jsonb,
  headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || v_anon, 'x-cron-secret', v_secret),
  timeout_milliseconds := 5000);
EXCEPTION WHEN others THEN
 RAISE WARNING 'web_push_kick failed: %', SQLERRM;
END $function$;
REVOKE ALL ON FUNCTION public.web_push_kick() FROM PUBLIC, anon, authenticated;

-- 作品名（グループの見出しと同じ。作品が無ければグループ名）
CREATE OR REPLACE FUNCTION public.web_push_group_title(p_group uuid)
 RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $$
  SELECT coalesce((SELECT nullif(btrim(s.title), '') FROM public.scenario_masters s WHERE s.id = g.scenario_master_id), nullif(btrim(g.name), ''), '貸切グループ')
    FROM public.private_groups g WHERE g.id = p_group
$$;
REVOKE ALL ON FUNCTION public.web_push_group_title(uuid) FROM PUBLIC, anon, authenticated;

-- 本文の先頭 n 文字（空白をまとめ、超えたら …）
CREATE OR REPLACE FUNCTION public.web_push_snippet(p_text text, p_len integer DEFAULT 60)
 RETURNS text LANGUAGE sql IMMUTABLE SET search_path TO 'public', 'pg_temp' AS $$
  SELECT CASE WHEN char_length(t) > p_len THEN left(t, p_len) || '…' ELSE t END
    FROM (SELECT btrim(regexp_replace(coalesce(p_text, ''), '\s+', ' ', 'g')) AS t) x
$$;
REVOKE ALL ON FUNCTION public.web_push_snippet(text, integer) FROM PUBLIC, anon, authenticated;

-- このグループのプッシュが ON か（行が無ければ ON）
CREATE OR REPLACE FUNCTION public.web_push_group_enabled(p_group uuid, p_member uuid)
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $$
  SELECT coalesce((SELECT s.push_enabled FROM public.private_group_notification_settings s WHERE s.group_id = p_group AND s.member_id = p_member), true)
$$;
REVOKE ALL ON FUNCTION public.web_push_group_enabled(uuid, uuid) FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 5. チャットの発言 → プッシュ（コミット時。写真の記録が入ってから数えるため）
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.web_push_on_group_message()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $function$
DECLARE g public.private_groups%ROWTYPE; v_payload jsonb; v_sender_user uuid; v_sender text; v_title text; v_text text; v_photos integer;
 v_reply_member uuid; v_single text; v_reply text; v_link text; r record; v_open uuid; v_last_sent timestamptz; v_kick boolean := false;
BEGIN
 BEGIN
  -- お知らせ（JSON のオブジェクト）は対象外。消された発言も送らない
  v_payload := public.private_group_message_payload(NEW.message);
  IF v_payload IS NOT NULL AND jsonb_typeof(v_payload) = 'object' THEN RETURN NULL; END IF;
  IF EXISTS (SELECT 1 FROM public.private_group_messages WHERE id = NEW.id AND deleted_at IS NOT NULL) THEN RETURN NULL; END IF;
  SELECT * INTO g FROM public.private_groups WHERE id = NEW.group_id;
  IF NOT FOUND OR g.status = 'cancelled' THEN RETURN NULL; END IF;
  -- 購読している参加者がいなければ何もしない（ほとんどの発言はここで終わる）
  IF NOT EXISTS (SELECT 1 FROM public.private_group_members m JOIN public.web_push_subscriptions s ON s.user_id = m.user_id
                  WHERE m.group_id = g.id AND m.status = 'joined' AND m.id <> NEW.member_id) THEN RETURN NULL; END IF;

  SELECT user_id INTO v_sender_user FROM public.private_group_members WHERE id = NEW.member_id;
  v_sender := coalesce(public.private_group_member_display_name(NEW.member_id), 'メンバー');
  v_title := public.web_push_group_title(g.id);
  SELECT count(*) INTO v_photos FROM public.private_group_message_photos WHERE message_id = NEW.id;
  v_text := public.web_push_snippet(NEW.message, 60);
  IF v_text = '' AND v_photos = 0 THEN RETURN NULL; END IF;
  v_single := CASE WHEN v_photos > 0 THEN format('%sさんが写真を %s 枚送りました', v_sender, v_photos) || CASE WHEN v_text <> '' THEN ': ' || v_text ELSE '' END
                   ELSE v_sender || ': ' || v_text END;
  v_reply := format('%sさんがあなたに返信しました', v_sender) || CASE WHEN v_text <> '' THEN ': ' || v_text WHEN v_photos > 0 THEN format('（写真 %s 枚）', v_photos) ELSE '' END;
  IF NEW.reply_to_message_id IS NOT NULL THEN
   SELECT member_id INTO v_reply_member FROM public.private_group_messages WHERE id = NEW.reply_to_message_id AND group_id = g.id;
  END IF;
  v_link := '/group/invite/' || g.invite_code || '?tab=chat';

  FOR r IN SELECT m.id, m.user_id FROM public.private_group_members m
     WHERE m.group_id = g.id AND m.status = 'joined' AND m.user_id IS NOT NULL AND m.id <> NEW.member_id
       AND m.user_id IS DISTINCT FROM v_sender_user
       AND public.web_push_group_enabled(g.id, m.id)
       AND EXISTS (SELECT 1 FROM public.web_push_subscriptions s WHERE s.user_id = m.user_id)
  LOOP
   IF v_reply_member = r.id THEN
    -- 自分宛ての返信はまとめずに送る
    INSERT INTO public.web_push_outbox(user_id, group_id, member_id, kind, last_message_id, last_message_at, title, body, url, tag)
    VALUES (r.user_id, g.id, r.id, 'reply', NEW.id, NEW.created_at, v_title, v_reply, v_link, 'group-chat-' || g.id::text);
    v_kick := true;
    CONTINUE;
   END IF;
   -- まだ送っていない（送信処理が手を付けていない）まとめ待ちがあれば、そこに足す
   SELECT id INTO v_open FROM public.web_push_outbox
    WHERE user_id = r.user_id AND group_id = g.id AND kind = 'chat' AND status = 'pending' AND claimed_until IS NULL
    ORDER BY created_at DESC LIMIT 1 FOR UPDATE;
   IF FOUND THEN
    UPDATE public.web_push_outbox
       SET message_count = message_count + 1, last_message_id = NEW.id, last_message_at = NEW.created_at,
           body = format('%sさんほか %s 件の新着', v_sender, message_count)
     WHERE id = v_open;
   ELSE
    -- 直前に送ってから 30 秒たつまでは待ち、その間の発言を 1 通にまとめる
    SELECT max(sent_at) INTO v_last_sent FROM public.web_push_outbox
     WHERE user_id = r.user_id AND group_id = g.id AND kind IN ('chat', 'reply') AND status = 'sent' AND sent_at > clock_timestamp() - interval '30 seconds';
    INSERT INTO public.web_push_outbox(user_id, group_id, member_id, kind, last_message_id, last_message_at, title, body, url, tag, send_after)
    VALUES (r.user_id, g.id, r.id, 'chat', NEW.id, NEW.created_at, v_title, v_single, v_link, 'group-chat-' || g.id::text,
            greatest(clock_timestamp(), coalesce(v_last_sent + interval '30 seconds', clock_timestamp())));
    v_kick := true;
   END IF;
  END LOOP;
  IF v_kick THEN PERFORM public.web_push_kick(); END IF;
 EXCEPTION WHEN others THEN
  RAISE WARNING 'web_push_on_group_message failed: %', SQLERRM;
 END;
 RETURN NULL;
END $function$;
REVOKE ALL ON FUNCTION public.web_push_on_group_message() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS web_push_on_group_message ON public.private_group_messages;
CREATE CONSTRAINT TRIGGER web_push_on_group_message AFTER INSERT ON public.private_group_messages
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW WHEN (NEW.member_id IS NOT NULL AND NEW.deleted_at IS NULL)
 EXECUTE FUNCTION public.web_push_on_group_message();

-- ---------------------------------------------------------------------------
-- 6. 通知ベルのうち大事なもの → プッシュ（ベル・メールはそのまま。二重に作らない）
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.web_push_on_user_notification()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $function$
DECLARE v_kind text; v_group uuid; v_member uuid;
BEGIN
 BEGIN
  v_kind := NEW.metadata->>'kind';
  IF NEW.user_id IS NULL OR NEW.link IS NULL OR NEW.link !~ '^/' THEN RETURN NULL; END IF;
  IF v_kind = 'private_group_handover' AND coalesce(NEW.metadata->>'status', '') <> 'requested' THEN RETURN NULL; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.web_push_subscriptions WHERE user_id = NEW.user_id) THEN RETURN NULL; END IF;
  v_group := CASE WHEN coalesce(NEW.metadata->>'group_id', '') ~ '^[0-9a-f-]{36}$' THEN (NEW.metadata->>'group_id')::uuid END;
  IF v_group IS NULL AND NEW.related_reservation_id IS NOT NULL THEN
   SELECT private_group_id INTO v_group FROM public.reservations WHERE id = NEW.related_reservation_id;
  END IF;
  IF v_group IS NOT NULL THEN
   SELECT id INTO v_member FROM public.private_group_members WHERE group_id = v_group AND user_id = NEW.user_id ORDER BY (status = 'joined') DESC LIMIT 1;
   IF v_member IS NOT NULL AND NOT public.web_push_group_enabled(v_group, v_member) THEN RETURN NULL; END IF;
  END IF;
  INSERT INTO public.web_push_outbox(user_id, group_id, member_id, kind, dedupe_key, notification_id, title, body, url, tag)
  VALUES (NEW.user_id, v_group, v_member, 'notice', 'notice:' || NEW.id::text, NEW.id, left(NEW.title, 80),
          public.web_push_snippet(NEW.message, 120), NEW.link, 'notice-' || NEW.id::text)
  ON CONFLICT (dedupe_key) DO NOTHING;
  PERFORM public.web_push_kick();
 EXCEPTION WHEN others THEN
  RAISE WARNING 'web_push_on_user_notification failed: %', SQLERRM;
 END;
 RETURN NULL;
END $function$;
REVOKE ALL ON FUNCTION public.web_push_on_user_notification() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS web_push_on_user_notification ON public.user_notifications;
CREATE TRIGGER web_push_on_user_notification AFTER INSERT ON public.user_notifications
 FOR EACH ROW WHEN (NEW.metadata->>'kind' IN ('private_confirmed', 'private_rejected', 'private_group_handover', 'private_dates_aligned'))
 EXECUTE FUNCTION public.web_push_on_user_notification();

-- ---------------------------------------------------------------------------
-- 7. 日程がそろった（参加中の全員が ○ の候補日ができた）→ 主催者にベル＋メール、会員のメンバーにベル
--    店舗への申込前だけ。同じ候補日では 1 回だけ。全員 ○ の候補日はいちばん点が高い（最有力）ので、複数あれば日付の早い方
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.private_group_notice_dates_aligned(p_group uuid)
 RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $function$
DECLARE g public.private_groups%ROWTYPE; c public.private_group_candidate_dates%ROWTYPE; n integer; v_work text; v_when text; v_when_long text;
 v_link text; v_bell uuid; v_email text; v_name text; mem record;
BEGIN
 SELECT * INTO g FROM public.private_groups WHERE id = p_group;
 IF NOT FOUND OR g.status NOT IN ('gathering', 'date_adjusting') THEN RETURN false; END IF;
 IF g.reservation_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.reservations WHERE id = g.reservation_id AND status <> 'cancelled') THEN RETURN false; END IF;
 SELECT count(*) INTO n FROM public.private_group_members WHERE group_id = g.id AND status = 'joined';
 IF n < 2 THEN RETURN false; END IF;
 SELECT cd.* INTO c FROM public.private_group_candidate_dates cd
  WHERE cd.group_id = g.id AND coalesce(cd.status, 'active') <> 'rejected' AND cd.withdrawn_at IS NULL
    AND (SELECT count(*) FROM public.private_group_date_responses r JOIN public.private_group_members jm ON jm.id = r.member_id AND jm.status = 'joined'
          WHERE r.candidate_date_id = cd.id AND r.response = 'ok') >= n
  ORDER BY cd.date, cd.start_time, cd.id LIMIT 1;
 IF NOT FOUND THEN RETURN false; END IF;
 v_work := public.web_push_group_title(g.id);
 v_when := concat_ws(' ', public.customer_notice_when(c.date), c.time_slot);
 v_when_long := concat_ws(' ', public.customer_notice_when_long(c.date), c.time_slot);
 v_link := '/group/invite/' || g.invite_code || '?tab=dates';
 v_bell := public.customer_notice_bell(g.organizer_id, NULL, g.organization_id, 'system', 'private_dates_aligned',
  'private_dates_aligned:' || c.id::text || ':' || g.organizer_id::text, '日程がそろいました',
  format('「%s」の貸切は %s なら全員が参加できます。店舗に申し込みましょう。', v_work, v_when), v_link, NULL, NULL,
  jsonb_build_object('group_id', g.id, 'candidate_date_id', c.id));
 SELECT x.email, x.name INTO v_email, v_name FROM public.customer_notice_user_contact(g.organizer_id) x;
 PERFORM public.customer_notice_enqueue_email(g.organization_id, 'private_dates_aligned', 'private_dates_aligned:' || c.id::text || ':mail', 'other',
  v_email, v_name, '【日程がそろいました】' || v_work,
  ARRAY[format('「%s」の貸切の日程調整で、参加中の %s 名全員が「参加できる」と答えた候補日ができました。', v_work, n), '',
   '候補日: ' || v_when_long, '', 'グループ画面の「日程」から、この日で店舗に申し込めます。'],
  v_link, 'ご不明な点は、グループ画面の歯車マークから「店舗へのお問い合わせ」をご利用ください。', false, v_bell);
 FOR mem IN SELECT gm.user_id FROM public.private_group_members gm
   WHERE gm.group_id = g.id AND gm.status = 'joined' AND gm.user_id IS NOT NULL AND gm.user_id <> g.organizer_id AND NOT gm.is_organizer
 LOOP
  PERFORM public.customer_notice_bell(mem.user_id, NULL, g.organization_id, 'system', 'private_dates_aligned',
   'private_dates_aligned:' || c.id::text || ':' || mem.user_id::text, '日程がそろいました',
   format('「%s」の貸切は %s なら全員が参加できます。主催者の申込をお待ちください。', v_work, v_when), v_link, NULL, NULL,
   jsonb_build_object('group_id', g.id, 'candidate_date_id', c.id));
 END LOOP;
 RETURN true;
END $function$;
REVOKE ALL ON FUNCTION public.private_group_notice_dates_aligned(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.private_group_notice_dates_aligned(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.private_group_on_date_response()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $function$
BEGIN
 BEGIN
  IF NEW.response = 'ok' THEN PERFORM public.private_group_notice_dates_aligned(NEW.group_id); END IF;
 EXCEPTION WHEN others THEN
  RAISE WARNING 'private_group_on_date_response failed: %', SQLERRM;
 END;
 RETURN NULL;
END $function$;
REVOKE ALL ON FUNCTION public.private_group_on_date_response() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS private_group_on_date_response ON public.private_group_date_responses;
CREATE CONSTRAINT TRIGGER private_group_on_date_response AFTER INSERT OR UPDATE OF response ON public.private_group_date_responses
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW WHEN (NEW.response = 'ok')
 EXECUTE FUNCTION public.private_group_on_date_response();

-- ---------------------------------------------------------------------------
-- 8. ブラウザから呼ぶ RPC（本人だけ）
-- ---------------------------------------------------------------------------
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

-- グループごとの ON/OFF を読む（p_enabled が NULL）・変える。参加中の会員本人だけ（ゲストにはプッシュが無い）
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

-- ---------------------------------------------------------------------------
-- 9. 送信処理（send-web-push）が使う
-- ---------------------------------------------------------------------------
-- 送る時刻が来たものを取り出す（2 分間は他の処理が取らない）。古い記録（7 日）もここで消す
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

-- 結果を記録する。p_status: sent / skipped / failed / retry（retry は 5 回まで、p_retry_seconds 後にもう一度）
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

-- 次に送る時刻（まとめ待ちの間、送信処理が待って送るため）
CREATE OR REPLACE FUNCTION public.web_push_next_due()
 RETURNS timestamptz LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $$
  SELECT min(send_after) FROM public.web_push_outbox WHERE status = 'pending' AND claimed_until IS NULL
$$;
REVOKE ALL ON FUNCTION public.web_push_next_due() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.web_push_next_due() TO service_role;

-- ---------------------------------------------------------------------------
-- 10. ゲストへの未読まとめメール（毎朝 9 時 JST。前日の朝からの、読んでいない発言があるときだけ）
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.private_group_guest_chat_digest(p_now timestamptz DEFAULT now())
 RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $function$
DECLARE m record; v_count integer; v_lines text[]; v_work text; v_day text; v_since timestamptz := p_now - interval '24 hours'; n integer := 0;
BEGIN
 v_day := to_char(p_now AT TIME ZONE 'Asia/Tokyo', 'YYYYMMDD');
 FOR m IN SELECT gm.id, gm.group_id, g.organization_id, g.invite_code,
    coalesce(nullif(btrim(pii.guest_email), ''), nullif(btrim(gm.guest_email), '')) AS email,
    coalesce(nullif(btrim(pii.guest_name), ''), nullif(btrim(gm.guest_name), '')) AS name,
    greatest(coalesce(rs.last_read_at, '-infinity'::timestamptz), v_since) AS after_at
   FROM public.private_group_members gm
   JOIN public.private_groups g ON g.id = gm.group_id AND g.status <> 'cancelled'
   LEFT JOIN public.private_group_members_pii pii ON pii.member_id = gm.id
   LEFT JOIN public.private_group_read_states rs ON rs.group_id = gm.group_id AND rs.member_id = gm.id
  WHERE gm.user_id IS NULL AND gm.status = 'joined'
 LOOP
  SELECT count(*) INTO v_count FROM public.private_group_messages pm
   WHERE pm.group_id = m.group_id AND pm.member_id IS NOT NULL AND pm.member_id <> m.id AND pm.deleted_at IS NULL
     AND pm.created_at > m.after_at AND pm.created_at <= p_now
     AND (public.private_group_message_payload(pm.message) IS NULL OR jsonb_typeof(public.private_group_message_payload(pm.message)) <> 'object');
  IF v_count = 0 OR m.email IS NULL THEN CONTINUE; END IF;
  v_work := public.web_push_group_title(m.group_id);
  SELECT array_agg(x.line ORDER BY x.created_at) INTO v_lines FROM (
   SELECT pm.created_at, '・' || coalesce(public.private_group_member_display_name(pm.member_id), 'メンバー') || 'さん: '
     || CASE WHEN public.web_push_snippet(pm.message, 40) <> '' THEN public.web_push_snippet(pm.message, 40) ELSE '写真' END AS line
     FROM public.private_group_messages pm
    WHERE pm.group_id = m.group_id AND pm.member_id IS NOT NULL AND pm.member_id <> m.id AND pm.deleted_at IS NULL
      AND pm.created_at > m.after_at AND pm.created_at <= p_now
      AND (public.private_group_message_payload(pm.message) IS NULL OR jsonb_typeof(public.private_group_message_payload(pm.message)) <> 'object')
    ORDER BY pm.created_at DESC LIMIT 5) x;
  IF public.customer_notice_enqueue_email(m.organization_id, 'private_chat_digest', 'private_chat_digest:' || m.id::text || ':' || v_day, 'other',
     m.email, m.name, '【未読のメッセージ ' || v_count || '件】' || v_work,
     ARRAY[format('「%s」の貸切グループのチャットに、まだお読みでないメッセージが %s 件あります。', v_work, v_count), '']
       || coalesce(v_lines, '{}'::text[]) || CASE WHEN v_count > 5 THEN ARRAY['（ほか ' || (v_count - 5) || ' 件）'] ELSE '{}'::text[] END,
     '/group/invite/' || m.invite_code || '?tab=chat',
     'このお知らせは、アカウントを作らずにご参加の方へ 1 日 1 回お送りしています。', true) IS NOT NULL THEN
   n := n + 1;
  END IF;
 END LOOP;
 RETURN n;
END $function$;
REVOKE ALL ON FUNCTION public.private_group_guest_chat_digest(timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.private_group_guest_chat_digest(timestamptz) TO service_role;

-- ---------------------------------------------------------------------------
-- 11. 定期実行
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('cron.job') IS NULL THEN RAISE NOTICE 'pg_cron is not available; skipped'; RETURN; END IF;
  -- ゲストの未読まとめ（毎日 0:00 UTC = 9:00 JST。メールの送信そのものは customer_notice_email が on の環境だけ）
  PERFORM cron.schedule('private-group-guest-chat-digest', '0 0 * * *', $job$SELECT public.private_group_guest_chat_digest()$job$);
  -- プッシュの取りこぼし（呼び出しの失敗・まとめ待ち）を毎分拾う。接続設定がある環境だけ
  IF NOT EXISTS(SELECT 1 FROM public.app_config WHERE key='supabase_url' AND value ~ '^https://[a-z0-9]+\.supabase\.co/?$')
    OR NOT EXISTS(SELECT 1 FROM public.app_config WHERE key='supabase_anon_key' AND length(value)>0)
    OR NOT EXISTS(SELECT 1 FROM public.app_config WHERE key='trigger_secret' AND length(value)>0) THEN
    RAISE NOTICE 'web push cron configuration missing; skipped'; RETURN;
  END IF;
  PERFORM cron.schedule('process-web-push', '* * * * *', $job$
    SELECT net.http_post(
      url := rtrim((SELECT value FROM public.app_config WHERE key='supabase_url'),'/') || '/functions/v1/send-web-push',
      headers := jsonb_build_object('Content-Type','application/json',
        'Authorization','Bearer ' || (SELECT value FROM public.app_config WHERE key='supabase_anon_key'),
        'x-cron-secret',(SELECT value FROM public.app_config WHERE key='trigger_secret')),
      body := '{}'::jsonb, timeout_milliseconds := 60000
    )
    WHERE EXISTS (SELECT 1 FROM public.web_push_outbox WHERE status = 'pending' AND send_after <= clock_timestamp()
      AND (claimed_until IS NULL OR claimed_until < clock_timestamp()));
  $job$);
END $$;

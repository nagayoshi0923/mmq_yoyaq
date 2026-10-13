-- 20261010130000 の取り消し: 貸切グループページ刷新 段階 3（ウェブプッシュ通知）を外す
-- 注意: 端末の購読・グループごとの ON/OFF・送信待ちの記録が消える（端末側の購読はブラウザに残るが、送る側が無くなるので届かない）。
-- 作られた通知ベル（日程がそろいました）と、積まれたメール（日程がそろいました・ゲストの未読まとめ）は残る。
BEGIN;
DO $$
BEGIN
  IF to_regclass('cron.job') IS NOT NULL THEN
    PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname IN ('process-web-push', 'private-group-guest-chat-digest');
  END IF;
END $$;
DROP TRIGGER IF EXISTS web_push_on_group_message ON public.private_group_messages;
DROP TRIGGER IF EXISTS web_push_on_user_notification ON public.user_notifications;
DROP TRIGGER IF EXISTS private_group_on_date_response ON public.private_group_date_responses;
DROP FUNCTION IF EXISTS public.private_group_guest_chat_digest(timestamptz);
DROP FUNCTION IF EXISTS public.web_push_next_due();
DROP FUNCTION IF EXISTS public.web_push_finish(uuid, text, integer, text, integer);
DROP FUNCTION IF EXISTS public.web_push_claim(integer);
DROP FUNCTION IF EXISTS public.private_group_push_setting(uuid, boolean);
DROP FUNCTION IF EXISTS public.web_push_subscription_delete(text);
DROP FUNCTION IF EXISTS public.web_push_subscription_save(text, text, text, text);
DROP FUNCTION IF EXISTS public.private_group_on_date_response();
DROP FUNCTION IF EXISTS public.private_group_notice_dates_aligned(uuid);
DROP FUNCTION IF EXISTS public.web_push_on_user_notification();
DROP FUNCTION IF EXISTS public.web_push_on_group_message();
DROP FUNCTION IF EXISTS public.web_push_group_enabled(uuid, uuid);
DROP FUNCTION IF EXISTS public.web_push_snippet(text, integer);
DROP FUNCTION IF EXISTS public.web_push_group_title(uuid);
DROP FUNCTION IF EXISTS public.web_push_kick();
DROP TABLE IF EXISTS public.web_push_outbox;
DROP TABLE IF EXISTS public.private_group_notification_settings;
DROP TABLE IF EXISTS public.web_push_subscriptions;
COMMIT;

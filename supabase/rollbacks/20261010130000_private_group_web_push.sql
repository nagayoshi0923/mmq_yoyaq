-- 20261010130000 の取り消し: 貸切グループページ刷新 段階 3（ウェブプッシュ通知）を外す
-- 注意: 端末の購読・グループごとの ON/OFF・送信待ちの記録は、先に rollback_backup へ退避してから消す（端末側の購読はブラウザに残るが、送る側が無くなるので届かない）。
-- 作られた通知ベル（日程がそろいました）と、積まれたメール（日程がそろいました・ゲストの未読まとめ）は残る。
BEGIN;
-- 消す前に退避する（2026-10-20 監査 R5。手順は docs/ops/本番公開の戻し方_2026-10.md）
-- 退避先: 非公開のスキーマ rollback_backup の <表名>_backup_<JST の日付>。ブラウザの役割（anon / authenticated）からは読めない。
-- 同じ日の退避が既にあれば上書きせず、ここで止める（このファイル全体が 1 つの取引なので何も消えない）。
CREATE SCHEMA IF NOT EXISTS rollback_backup;
REVOKE ALL ON SCHEMA rollback_backup FROM PUBLIC, anon, authenticated;
DO $backup$
DECLARE v_suffix text := to_char(now() AT TIME ZONE 'Asia/Tokyo', 'YYYYMMDD'); v_src text; v_dst text; v_rows bigint;
BEGIN
  FOREACH v_src IN ARRAY ARRAY['web_push_subscriptions', 'private_group_notification_settings', 'web_push_outbox'] LOOP
    IF to_regclass('public.' || v_src) IS NULL THEN CONTINUE; END IF;
    v_dst := v_src || '_backup_' || v_suffix;
    IF to_regclass(format('rollback_backup.%I', v_dst)) IS NOT NULL THEN
      RAISE EXCEPTION '退避先 rollback_backup.% が既にあります。中身を確かめて別名へ移してから流し直してください', v_dst;
    END IF;
    EXECUTE format('CREATE TABLE rollback_backup.%I AS TABLE public.%I', v_dst, v_src);
    EXECUTE format('REVOKE ALL ON rollback_backup.%I FROM PUBLIC, anon, authenticated', v_dst);
    EXECUTE format('SELECT count(*) FROM rollback_backup.%I', v_dst) INTO v_rows;
    RAISE NOTICE '退避しました: public.% → rollback_backup.% (% 行)', v_src, v_dst, v_rows;
  END LOOP;
END $backup$;
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

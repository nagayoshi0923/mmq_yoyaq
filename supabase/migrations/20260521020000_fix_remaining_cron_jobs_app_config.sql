-- 残った cron ジョブ (notify-kit-transfer-plan / auto-send-reminder-emails-day-before) を
-- app_config パターンに統一する。
--
-- 経緯:
--   20260514010000 で 3 ジョブ (retry-discord-notifications / process-booking-email-queue /
--   process-waitlist-queue) を current_setting() → app_config に切り替えたが、
--   notify-kit-transfer-plan / auto-send-reminder-emails-day-before の 2 つが取り残されていた。
--
-- 影響:
--   Supabase Cloud では `current_setting('app.settings.xxx', true)` は NULL を返すため、
--   net.http_post に url=NULL / Authorization='Bearer ' で渡され、http_request_queue の
--   NOT NULL 制約違反でジョブが毎日サイレント失敗していた（前日リマインダーメール / GMキット転送通知が
--   届かない事故が約5日連続）。
--
-- 修正:
--   既存ジョブの command を app_config 参照パターンに ALTER。
--   ジョブが存在しない環境（staging に notify-kit-transfer-plan が無い等）は NOTICE でスキップ。
--
-- 冪等性:
--   cron.alter_job は同じ内容で何度叩いても安全。本番では既に手動で alter 済み。

DO $$
DECLARE
  v_jobid BIGINT;
BEGIN
  -- pg_cron が利用可能かチェック
  BEGIN
    PERFORM 1 FROM cron.job LIMIT 1;
  EXCEPTION
    WHEN undefined_table OR undefined_object THEN
      RAISE NOTICE 'ℹ️  cron.job が存在しません（pg_cron 未導入のためスキップ）';
      RETURN;
  END;

  -- notify-kit-transfer-plan
  SELECT jobid INTO v_jobid FROM cron.job WHERE jobname = 'notify-kit-transfer-plan';
  IF v_jobid IS NOT NULL THEN
    PERFORM cron.alter_job(v_jobid, command => $cmd$
      SELECT net.http_post(
        url := (SELECT value FROM public.app_config WHERE key = 'supabase_url') || '/functions/v1/notify-kit-transfer-plan',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || (SELECT value FROM public.app_config WHERE key = 'supabase_anon_key'),
          'x-cron-secret', (SELECT value FROM public.app_config WHERE key = 'trigger_secret')
        ),
        body := '{}'::jsonb
      ) AS request_id
    $cmd$);
    RAISE NOTICE '✅ notify-kit-transfer-plan のコマンドを更新しました';
  ELSE
    RAISE NOTICE 'ℹ️  notify-kit-transfer-plan が見つかりません（スキップ）';
  END IF;

  -- auto-send-reminder-emails-day-before
  SELECT jobid INTO v_jobid FROM cron.job WHERE jobname = 'auto-send-reminder-emails-day-before';
  IF v_jobid IS NOT NULL THEN
    PERFORM cron.alter_job(v_jobid, command => $cmd$
      SELECT net.http_post(
        url := (SELECT value FROM public.app_config WHERE key = 'supabase_url') || '/functions/v1/auto-send-reminder-emails',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || (SELECT value FROM public.app_config WHERE key = 'supabase_anon_key'),
          'x-cron-secret', (SELECT value FROM public.app_config WHERE key = 'trigger_secret')
        ),
        body := '{"days_before": 1}'::jsonb
      ) AS request_id
    $cmd$);
    RAISE NOTICE '✅ auto-send-reminder-emails-day-before のコマンドを更新しました';
  ELSE
    RAISE NOTICE 'ℹ️  auto-send-reminder-emails-day-before が見つかりません（スキップ）';
  END IF;
END $$;

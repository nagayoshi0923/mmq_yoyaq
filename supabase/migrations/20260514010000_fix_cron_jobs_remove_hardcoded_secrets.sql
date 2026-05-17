-- cron ジョブのハードコードされたシークレットを app_config 参照に変更
--
-- 問題: retry-discord-notifications / process-booking-email-queue / process-waitlist-queue の
--       x-cron-secret がハードコードされており、CRON_SECRET 変更時に 401 になる。
-- 解決: app_config.trigger_secret を参照する方式に統一（DB トリガーと同じ値を使用）
--
-- 修正: UPDATE cron.job は postgres ロールに UPDATE 権限がないため
--       cron.alter_job() 関数（SECURITY DEFINER）を使用する

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

  -- retry-discord-notifications
  SELECT jobid INTO v_jobid FROM cron.job WHERE jobname = 'retry-discord-notifications';
  IF v_jobid IS NOT NULL THEN
    PERFORM cron.alter_job(v_jobid, command => $cmd$
      SELECT net.http_post(
        url := (SELECT value FROM public.app_config WHERE key = 'supabase_url') || '/functions/v1/retry-discord-notifications',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || (SELECT value FROM public.app_config WHERE key = 'supabase_anon_key'),
          'x-cron-secret', (SELECT value FROM public.app_config WHERE key = 'trigger_secret')
        ),
        body := '{}'::jsonb
      ) AS request_id
    $cmd$);
    RAISE NOTICE '✅ retry-discord-notifications のコマンドを更新しました';
  ELSE
    RAISE NOTICE 'ℹ️  retry-discord-notifications が見つかりません（スキップ）';
  END IF;

  -- process-booking-email-queue
  SELECT jobid INTO v_jobid FROM cron.job WHERE jobname = 'process-booking-email-queue';
  IF v_jobid IS NOT NULL THEN
    PERFORM cron.alter_job(v_jobid, command => $cmd$
      SELECT net.http_post(
        url := (SELECT value FROM public.app_config WHERE key = 'supabase_url') || '/functions/v1/process-booking-email-queue',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || (SELECT value FROM public.app_config WHERE key = 'supabase_anon_key'),
          'x-cron-secret', (SELECT value FROM public.app_config WHERE key = 'trigger_secret')
        ),
        body := '{}'::jsonb
      ) AS request_id
    $cmd$);
    RAISE NOTICE '✅ process-booking-email-queue のコマンドを更新しました';
  ELSE
    RAISE NOTICE 'ℹ️  process-booking-email-queue が見つかりません（スキップ）';
  END IF;

  -- process-waitlist-queue
  SELECT jobid INTO v_jobid FROM cron.job WHERE jobname = 'process-waitlist-queue';
  IF v_jobid IS NOT NULL THEN
    PERFORM cron.alter_job(v_jobid, command => $cmd$
      SELECT net.http_post(
        url := (SELECT value FROM public.app_config WHERE key = 'supabase_url') || '/functions/v1/process-waitlist-queue',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || (SELECT value FROM public.app_config WHERE key = 'supabase_anon_key'),
          'x-cron-secret', (SELECT value FROM public.app_config WHERE key = 'trigger_secret')
        ),
        body := '{}'::jsonb
      ) AS request_id
    $cmd$);
    RAISE NOTICE '✅ process-waitlist-queue のコマンドを更新しました';
  ELSE
    RAISE NOTICE 'ℹ️  process-waitlist-queue が見つかりません（スキップ）';
  END IF;

END;
$$;

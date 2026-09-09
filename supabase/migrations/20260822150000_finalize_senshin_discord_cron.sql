-- 戦塵貸切: 公演終了後に参加用チャンネルを開催終了へ移す cron
-- ロールバック:
--   SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'finalize-senshin-discord-rooms';

DO $$
BEGIN
  PERFORM cron.unschedule(jobid)
    FROM cron.job
   WHERE jobname = 'finalize-senshin-discord-rooms';

  PERFORM cron.schedule(
    'finalize-senshin-discord-rooms',
    '*/15 * * * *',
    $job$
    SELECT CASE
      WHEN (SELECT value FROM public.app_config WHERE key = 'supabase_url') IS NOT NULL
       AND (SELECT value FROM public.app_config WHERE key = 'supabase_anon_key') IS NOT NULL
       AND (SELECT value FROM public.app_config WHERE key = 'trigger_secret') IS NOT NULL
      THEN net.http_post(
        url := (SELECT value FROM public.app_config WHERE key = 'supabase_url') || '/functions/v1/provision-private-booking-discord',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || (SELECT value FROM public.app_config WHERE key = 'supabase_anon_key'),
          'x-cron-secret', (SELECT value FROM public.app_config WHERE key = 'trigger_secret')
        ),
        body := '{"action":"finalize_due"}'::jsonb
      )
      ELSE NULL
    END;
    $job$
  );
EXCEPTION
  WHEN undefined_table OR undefined_object THEN
    RAISE NOTICE 'ℹ️ pg_cron が利用できないため、戦塵Discord終了処理cronをスキップしました';
END $$;

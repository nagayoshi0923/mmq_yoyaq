-- Fix reminder email cron job 47: update stale hardcoded secret and add days_before: 3
-- Job 47 was using an old x-cron-secret that no longer matches the CRON_SECRET env var (→ 401 every run).
-- Also, the deployed function now defaults to days_before=1, so the 3-day reminder needs it explicit.

SELECT cron.unschedule('auto-send-reminder-emails');

SELECT cron.schedule(
  'auto-send-reminder-emails',
  '0 9 * * *',
  $$
  SELECT net.http_post(
    url := (SELECT value FROM public.app_config WHERE key = 'supabase_url') || '/functions/v1/auto-send-reminder-emails',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (SELECT value FROM public.app_config WHERE key = 'supabase_anon_key'),
      'x-cron-secret', (SELECT value FROM public.app_config WHERE key = 'trigger_secret')
    ),
    body := '{"days_before": 3}'::jsonb
  ) AS request_id;
  $$
);

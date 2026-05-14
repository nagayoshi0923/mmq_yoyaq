-- cron ジョブのハードコードされたシークレットを app_config 参照に変更
--
-- 問題: retry-discord-notifications / process-booking-email-queue / process-waitlist-queue の
--       x-cron-secret がハードコードされており、CRON_SECRET 変更時に 401 になる。
-- 解決: app_config.trigger_secret を参照する方式に統一（DB トリガーと同じ値を使用）

UPDATE cron.job
SET command = $cmd$
  SELECT net.http_post(
    url := (SELECT value FROM public.app_config WHERE key = 'supabase_url') || '/functions/v1/retry-discord-notifications',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (SELECT value FROM public.app_config WHERE key = 'supabase_anon_key'),
      'x-cron-secret', (SELECT value FROM public.app_config WHERE key = 'trigger_secret')
    ),
    body := '{}'::jsonb
  ) AS request_id;
$cmd$
WHERE jobname = 'retry-discord-notifications';

UPDATE cron.job
SET command = $cmd$
  SELECT net.http_post(
    url := (SELECT value FROM public.app_config WHERE key = 'supabase_url') || '/functions/v1/process-booking-email-queue',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (SELECT value FROM public.app_config WHERE key = 'supabase_anon_key'),
      'x-cron-secret', (SELECT value FROM public.app_config WHERE key = 'trigger_secret')
    ),
    body := '{}'::jsonb
  ) AS request_id;
$cmd$
WHERE jobname = 'process-booking-email-queue';

UPDATE cron.job
SET command = $cmd$
  SELECT net.http_post(
    url := (SELECT value FROM public.app_config WHERE key = 'supabase_url') || '/functions/v1/process-waitlist-queue',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (SELECT value FROM public.app_config WHERE key = 'supabase_anon_key'),
      'x-cron-secret', (SELECT value FROM public.app_config WHERE key = 'trigger_secret')
    ),
    body := '{}'::jsonb
  ) AS request_id;
$cmd$
WHERE jobname = 'process-waitlist-queue';

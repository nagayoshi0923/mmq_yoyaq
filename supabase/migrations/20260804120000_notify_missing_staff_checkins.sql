-- 公演開始55分前の担当GM出勤打刻漏れ通知
-- 送信は既存 discord_notification_queue / retry-discord-notifications 経路を利用する。

-- 既存通知キューに、公演・GM・対象JST日単位の冪等キーを追加する。
-- NULLの既存行は従来通知と衝突せず、今回の通知だけがこのキーを使用する。
ALTER TABLE public.discord_notification_queue
  ADD COLUMN IF NOT EXISTS dedupe_key TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS uq_discord_notification_queue_dedupe_key
  ON public.discord_notification_queue (organization_id, notification_type, dedupe_key);

COMMENT ON COLUMN public.discord_notification_queue.dedupe_key IS
  '通知種別内の冪等キー。出勤打刻漏れは schedule_event_id:staff_id:JST日付 を使用する。';

-- 毎分 JST の現在日・翌日分を検知する。URL・キーは public.app_config から取得し、未設定時は何もしない。
DO $$
BEGIN
  PERFORM cron.unschedule(jobid)
    FROM cron.job
   WHERE jobname = 'notify-missing-staff-checkins';

  PERFORM cron.schedule(
    'notify-missing-staff-checkins',
    '* * * * *',
    $job$
    SELECT CASE
      WHEN (SELECT value FROM public.app_config WHERE key = 'supabase_url') IS NOT NULL
       AND (SELECT value FROM public.app_config WHERE key = 'supabase_anon_key') IS NOT NULL
       AND (SELECT value FROM public.app_config WHERE key = 'trigger_secret') IS NOT NULL
      THEN net.http_post(
        url := (SELECT value FROM public.app_config WHERE key = 'supabase_url') || '/functions/v1/notify-missing-staff-checkins',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || (SELECT value FROM public.app_config WHERE key = 'supabase_anon_key'),
          'x-cron-secret', (SELECT value FROM public.app_config WHERE key = 'trigger_secret')
        ),
        body := '{}'::jsonb
      )
      ELSE NULL
    END;
    $job$
  );
EXCEPTION
  WHEN undefined_table OR undefined_object THEN
    RAISE NOTICE 'ℹ️ pg_cron が利用できないため、出勤打刻漏れ通知cronをスキップしました';
END $$;

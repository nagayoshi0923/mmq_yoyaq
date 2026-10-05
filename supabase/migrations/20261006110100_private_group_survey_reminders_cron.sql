-- アンケートのリマインドメールの送信処理を 5 分ごとに呼ぶ。送信待ちが無ければ何もしない。
-- 送信処理（process-survey-reminders）を本番に配置した後に適用する。
DO $$
BEGIN
  IF to_regclass('cron.job') IS NULL THEN RAISE NOTICE 'pg_cron is not available; skipped'; RETURN; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.app_config WHERE key='supabase_url' AND value ~ '^https://[a-z0-9]+\.supabase\.co/?$')
    OR NOT EXISTS(SELECT 1 FROM public.app_config WHERE key='supabase_anon_key' AND length(value)>0)
    OR NOT EXISTS(SELECT 1 FROM public.app_config WHERE key='trigger_secret' AND length(value)>0)
    THEN
    -- 接続先の設定が無い環境（構造の再現を確かめる使い捨ての DB など）では登録しない
    RAISE NOTICE 'survey reminder cron configuration missing; skipped'; RETURN;
  END IF;
  PERFORM cron.schedule('process-survey-reminders','*/5 * * * *',$job$
    SELECT net.http_post(
      url := rtrim((SELECT value FROM public.app_config WHERE key='supabase_url'),'/') || '/functions/v1/process-survey-reminders',
      headers := jsonb_build_object('Content-Type','application/json',
        'Authorization','Bearer ' || (SELECT value FROM public.app_config WHERE key='supabase_anon_key'),
        'x-cron-secret',(SELECT value FROM public.app_config WHERE key='trigger_secret')),
      body := '{}'::jsonb,timeout_milliseconds := 60000
    )
    WHERE EXISTS (SELECT 1 FROM public.private_group_survey_reminders WHERE status IN ('pending','sending') AND next_attempt_at<=clock_timestamp());
  $job$);
END $$;

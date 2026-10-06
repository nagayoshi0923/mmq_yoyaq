-- 公演前アンケートの自動リマインド: 毎日 10:00（日本時間）に、締切の 7 日前・前日の未回答者を送信待ちに積む（2026-10-06 社長指示で有効化）。
-- 実際に積むのは app_config の survey_reminder_auto が 'on' の環境だけ（本番のみ 'on'。検証環境は本番の写しのあとに消す: scripts/mask-staging-pii.sql）。
-- 同じ人・種類・締切には 1 回だけなので、1 日に何度動いても二重には送らない。
DO $$
BEGIN
  IF to_regclass('cron.job') IS NULL THEN RAISE NOTICE 'pg_cron is not available; skipped'; RETURN; END IF;
  PERFORM cron.schedule('enqueue-survey-reminders-daily','0 1 * * *',$job$
    SELECT public.enqueue_private_group_survey_reminders('deadline_7d'), public.enqueue_private_group_survey_reminders('deadline_1d')
     WHERE EXISTS (SELECT 1 FROM public.app_config WHERE key='survey_reminder_auto' AND value='on');
  $job$);
END $$;

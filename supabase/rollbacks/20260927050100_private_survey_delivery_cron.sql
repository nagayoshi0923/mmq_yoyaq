-- 配送を停止する。送信予定・履歴は保持する。
DO $$
DECLARE v_job bigint;
BEGIN
  SELECT jobid INTO v_job FROM cron.job WHERE jobname='process-private-survey-deliveries';
  IF v_job IS NOT NULL THEN PERFORM cron.unschedule(v_job); END IF;
END $$;

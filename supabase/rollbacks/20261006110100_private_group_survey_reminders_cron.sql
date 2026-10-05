-- rollback: リマインドメールの定期送信を止める。送信待ち・結果は残す。
DO $$
DECLARE v_job bigint;
BEGIN
  SELECT jobid INTO v_job FROM cron.job WHERE jobname='process-survey-reminders';
  IF v_job IS NOT NULL THEN PERFORM cron.unschedule(v_job); END IF;
END $$;

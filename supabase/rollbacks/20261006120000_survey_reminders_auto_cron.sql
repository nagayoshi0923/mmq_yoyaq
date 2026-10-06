-- rollback: 自動リマインドの毎日の積み込みを止める（積み済みの送信待ちは 5 分ごとの送信処理が送る。止めるなら status を skipped にする）
DO $$
DECLARE v_job bigint;
BEGIN
  SELECT jobid INTO v_job FROM cron.job WHERE jobname='enqueue-survey-reminders-daily';
  IF v_job IS NOT NULL THEN PERFORM cron.unschedule(v_job); END IF;
END $$;

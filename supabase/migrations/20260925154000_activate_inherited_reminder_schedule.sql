-- 適用順: 150000〜153000 DB → send-reminder-emails / auto-send-reminder-emails 配備 → このmigration。
-- 認証ヘッダー・接続先は既存jobのapp_config参照を保持し、実行間隔だけ変更する。
DO $$
DECLARE v_jobid bigint;
BEGIN
 SELECT jobid INTO v_jobid FROM cron.job WHERE jobname='auto-send-reminder-emails-day-before';
 IF v_jobid IS NULL THEN RAISE EXCEPTION '既存のリマインドjobを確認できません'; END IF;
 PERFORM cron.alter_job(v_jobid, schedule := '*/5 * * * *');
END;
$$;

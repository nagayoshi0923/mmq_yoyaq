-- Allow the scheduler's cold start and paginated due-event lookup to return a response.
-- Keep the existing URL and authentication headers unchanged.
DO $$
DECLARE v_job bigint; v_command text;
BEGIN
 SELECT jobid,command INTO v_job,v_command FROM cron.job WHERE jobname='auto-send-reminder-emails-day-before';
 IF v_job IS NULL THEN RAISE EXCEPTION 'reminder cron missing'; END IF;
 IF v_command ~ 'timeout_milliseconds' THEN
   v_command:=regexp_replace(v_command,'timeout_milliseconds\s*:=\s*[0-9]+','timeout_milliseconds := 60000');
 ELSIF v_command ~ '\)\s+AS request_id' THEN
   v_command:=regexp_replace(v_command,'\)\s+AS request_id',', timeout_milliseconds := 60000) AS request_id');
 ELSE RAISE EXCEPTION 'unexpected reminder cron format'; END IF;
 PERFORM cron.alter_job(v_job,command:=v_command);
END $$;

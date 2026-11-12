-- 20261113040000_cron_drop_legacy_anon_header.sql の戻し（旧形式の鍵を Authorization に付け直す）。
-- 旧形式の鍵が有効なときだけ意味がある。

DO $$
DECLARE
  j record;
BEGIN
  FOR j IN
    SELECT jobid, jobname, command FROM cron.job
     WHERE command ~ $re$/functions/v1/$re$
       AND command ~ $re$'x-cron-secret'$re$
       AND command !~ $re$'Authorization'$re$
       AND jobname NOT IN ('notify-missing-staff-checkins', 'retry-discord-notifications')
  LOOP
    PERFORM cron.alter_job(
      job_id := j.jobid,
      command := regexp_replace(
        j.command,
        $re$'x-cron-secret'$re$,
        $rep$'Authorization', 'Bearer ' || (SELECT value FROM public.app_config WHERE key = 'supabase_anon_key'), 'x-cron-secret'$rep$
      )
    );
  END LOOP;
END
$$;

CREATE OR REPLACE FUNCTION public.web_push_kick()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_url text; v_anon text; v_secret text;
BEGIN
 IF coalesce(current_setting('mmq.web_push_kicked', true), '') = '1' THEN RETURN; END IF;
 SELECT value INTO v_url FROM public.app_config WHERE key = 'supabase_url';
 SELECT value INTO v_anon FROM public.app_config WHERE key = 'supabase_anon_key';
 SELECT value INTO v_secret FROM public.app_config WHERE key = 'trigger_secret';
 IF coalesce(v_url, '') !~ '^https?://' OR coalesce(v_anon, '') = '' OR coalesce(v_secret, '') = '' OR to_regprocedure('net.http_post(text,jsonb,jsonb,jsonb,integer)') IS NULL THEN
  RETURN;
 END IF;
 PERFORM set_config('mmq.web_push_kicked', '1', true);
 PERFORM net.http_post(
  url := rtrim(v_url, '/') || '/functions/v1/send-web-push',
  body := '{}'::jsonb,
  headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || v_anon, 'x-cron-secret', v_secret),
  timeout_milliseconds := 5000);
EXCEPTION WHEN others THEN
 RAISE WARNING 'web_push_kick failed: %', SQLERRM;
END $function$;

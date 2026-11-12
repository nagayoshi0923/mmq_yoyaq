-- 定期送信（pg_cron）と Web Push の呼び出しから、旧形式の鍵（app_config.supabase_anon_key）を外す（#1273）。
--
-- 2026-11-03、本番で旧形式の鍵が無効化され、Authorization に旧 anon 鍵を付けた定期送信がすべて
-- 401「Legacy API keys are disabled」で 10 日止まった。呼び先の Edge Function は verify_jwt=false で、
-- 認証は x-cron-secret（app_config.trigger_secret）だけで行っている（isCronOrServiceRoleCall ほか）。
-- Authorization を付けない retry-discord-notifications は、鍵の無効化中も 200 で動いていた。
-- そこで Authorization だけを外し、旧形式の鍵がまた無効になっても（2026 年末に廃止予定）止まらないようにする。
--
-- 対象外: notify-missing-staff-checkins は呼び先の verify_jwt=true のため変えない（現在 active=false）。
-- 戻し方: supabase/rollbacks/20261113040000_cron_drop_legacy_anon_header.sql

DO $$
DECLARE
  j record;
  v_new text;
BEGIN
  FOR j IN
    SELECT jobid, jobname, command FROM cron.job
     WHERE command ~ $re$'Authorization',\s*'Bearer '\s*\|\|\s*\(SELECT value FROM public\.app_config WHERE key\s*=\s*'supabase_anon_key'\),\s*$re$
       AND jobname <> 'notify-missing-staff-checkins'
  LOOP
    v_new := regexp_replace(
      j.command,
      $re$'Authorization',\s*'Bearer '\s*\|\|\s*\(SELECT value FROM public\.app_config WHERE key\s*=\s*'supabase_anon_key'\),\s*$re$,
      '',
      'g'
    );
    PERFORM cron.alter_job(job_id := j.jobid, command := v_new);
    RAISE NOTICE 'cron % : Authorization（旧 anon 鍵）を外しました', j.jobname;
  END LOOP;
END
$$;

-- 現物（pg_get_functiondef、2026-11-13 本番）から、旧 anon 鍵の読み出し・必須判定・Authorization だけを外す。
CREATE OR REPLACE FUNCTION public.web_push_kick()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_url text; v_secret text;
BEGIN
 IF coalesce(current_setting('mmq.web_push_kicked', true), '') = '1' THEN RETURN; END IF;
 SELECT value INTO v_url FROM public.app_config WHERE key = 'supabase_url';
 SELECT value INTO v_secret FROM public.app_config WHERE key = 'trigger_secret';
 IF coalesce(v_url, '') !~ '^https?://' OR coalesce(v_secret, '') = '' OR to_regprocedure('net.http_post(text,jsonb,jsonb,jsonb,integer)') IS NULL THEN
  RETURN;
 END IF;
 PERFORM set_config('mmq.web_push_kicked', '1', true);
 PERFORM net.http_post(
  url := rtrim(v_url, '/') || '/functions/v1/send-web-push',
  body := '{}'::jsonb,
  headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', v_secret),
  timeout_milliseconds := 5000);
EXCEPTION WHEN others THEN
 RAISE WARNING 'web_push_kick failed: %', SQLERRM;
END $function$;

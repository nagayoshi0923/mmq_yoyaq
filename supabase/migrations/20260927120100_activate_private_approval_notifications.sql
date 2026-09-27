-- DB準備・配送Edge配備後に適用。確定通知を保存しない旧ブラウザの承認を拒否する。
REVOKE EXECUTE ON FUNCTION public.approve_private_booking_with_delivery(uuid,uuid,date,time,time,uuid,uuid,jsonb,text,text,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.approve_private_booking_with_delivery(uuid,uuid,date,time,time,uuid,uuid,jsonb,text,text,uuid) TO service_role;
-- 配送Edgeと旧送信APIの互換処理を配備した後、API/画面切替より前に適用する。
-- 事前にapp_config.supabase_urlが適用先プロジェクトのURLであることを確認する。
DO $$
BEGIN
  IF to_regclass('cron.job') IS NULL THEN RAISE EXCEPTION 'pg_cron is required'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.app_config WHERE key='supabase_url' AND value ~ '^https://[a-z0-9]+\.supabase\.co/?$')
    OR NOT EXISTS(SELECT 1 FROM public.app_config WHERE key='supabase_anon_key' AND length(value)>0)
    OR NOT EXISTS(SELECT 1 FROM public.app_config WHERE key='trigger_secret' AND length(value)>0)
    THEN RAISE EXCEPTION 'private approval delivery cron configuration missing'; END IF;
  PERFORM cron.schedule('process-private-approval-deliveries','*/5 * * * *',$job$
    SELECT net.http_post(
      url := rtrim((SELECT value FROM public.app_config WHERE key='supabase_url'),'/') || '/functions/v1/process-private-approval-deliveries',
      headers := jsonb_build_object('Content-Type','application/json',
        'Authorization','Bearer ' || (SELECT value FROM public.app_config WHERE key='supabase_anon_key'),
        'x-cron-secret',(SELECT value FROM public.app_config WHERE key='trigger_secret')),
      body := '{}'::jsonb,timeout_milliseconds := 60000
    );
  $job$);
END $$;

NOTIFY pgrst, 'reload schema';

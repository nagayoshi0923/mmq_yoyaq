-- retry-discord-notifications の定期実行（pg_cron）から旧 Authorization だけを外す。
-- 2026-11-03 に旧 API キー（legacy JWT）が無効化され、Authorization に旧 anon キーを載せた
-- 呼び出しが gateway で UNAUTHORIZED_DISABLED_LEGACY_KEY として拒否されている（11/3 09:30 から 401）。
-- 関数側の認証は x-cron-secret（app_config.trigger_secret の参照）で行うため、それは残す。
-- URL・本文・実行間隔・有効状態は変えない。命令の全文は読み出さず、該当の 1 組だけを置き換える。
-- 想定外の形（一致が 1 件でない）なら何も変えずに WARNING を出す。適用済みなら何もしない。
DO $$
DECLARE
  v_jobid bigint;
  v_cmd text;
  v_new text;
  v_n int;
  c_pat constant text := '''Authorization''\s*,\s*''Bearer ''\s*\|\|\s*\(\s*SELECT\s+value\s+FROM\s+public\.app_config\s+WHERE\s+key\s*=\s*''supabase_anon_key''\s*\)\s*,\s*';
BEGIN
  BEGIN
    SELECT jobid, command INTO v_jobid, v_cmd FROM cron.job WHERE jobname = 'retry-discord-notifications';
  EXCEPTION WHEN undefined_table OR invalid_schema_name THEN
    RAISE NOTICE 'pg_cron がないため skip';
    RETURN;
  END;
  IF v_jobid IS NULL THEN
    RAISE NOTICE 'retry-discord-notifications が無いため skip';
    RETURN;
  END IF;
  IF v_cmd !~* '''Authorization''' THEN
    RAISE NOTICE '適用済み（Authorization 無し）';
    RETURN;
  END IF;
  SELECT count(*) INTO v_n FROM regexp_matches(v_cmd, c_pat, 'gi');
  IF v_n <> 1 THEN
    RAISE WARNING 'retry-discord-notifications: 想定外の形（一致 % 件）のため変更しない', v_n;
    RETURN;
  END IF;
  v_new := regexp_replace(v_cmd, c_pat, '', 'i');
  IF v_new ~* '''Authorization'''
     OR v_new !~* '''x-cron-secret'''
     OR v_new !~* 'trigger_secret'
     OR v_new !~* '/functions/v1/retry-discord-notifications'
     OR v_new !~* '''\{\}''::jsonb' THEN
    RAISE WARNING 'retry-discord-notifications: 置換後の確認に失敗したため変更しない';
    RETURN;
  END IF;
  PERFORM cron.alter_job(v_jobid, command => v_new);
END
$$;

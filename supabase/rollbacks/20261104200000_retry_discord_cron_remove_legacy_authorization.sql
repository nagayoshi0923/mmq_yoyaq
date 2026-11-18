-- 20261104200000_retry_discord_cron_remove_legacy_authorization の巻き戻し:
-- retry-discord-notifications の command に、旧 Authorization（app_config.supabase_anon_key の参照）の 1 組を
-- x-cron-secret の直前へ戻す。適用前の md5(command) は 713b67440ba6a5c7f5a6ed4259cd71f2（2026-11-04 本番）。
-- 注意: 旧 API キーが無効なままなら、戻すと gateway で再び 401 になり Discord 再送が止まる。
-- 命令の全文は読み出さない。既に Authorization があれば何もしない。
DO $$
DECLARE
  v_jobid bigint;
  v_cmd text;
  v_new text;
BEGIN
  BEGIN
    SELECT jobid, command INTO v_jobid, v_cmd FROM cron.job WHERE jobname = 'retry-discord-notifications';
  EXCEPTION WHEN undefined_table OR invalid_schema_name THEN
    RETURN;
  END;
  IF v_jobid IS NULL OR v_cmd ~* '''Authorization''' THEN
    RETURN;
  END IF;
  IF (SELECT count(*) FROM regexp_matches(v_cmd, '''x-cron-secret''', 'g')) <> 1 THEN
    RAISE WARNING 'retry-discord-notifications: x-cron-secret の位置が特定できないため戻さない';
    RETURN;
  END IF;
  v_new := replace(v_cmd, '''x-cron-secret''',
    '''Authorization'', ''Bearer '' || (SELECT value FROM public.app_config WHERE key = ''supabase_anon_key''),' || E'\n          ' || '''x-cron-secret''');
  IF md5(v_new) <> '713b67440ba6a5c7f5a6ed4259cd71f2' THEN
    RAISE NOTICE 'retry-discord-notifications: 戻した命令は適用前と空白などが異なる（動作は同じ）';
  END IF;
  PERFORM cron.alter_job(v_jobid, command => v_new);
END
$$;

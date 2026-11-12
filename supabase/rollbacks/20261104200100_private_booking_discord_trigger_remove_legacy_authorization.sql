-- 20261104200100_private_booking_discord_trigger_remove_legacy_authorization の巻き戻し:
-- notify_private_booking_discord_trigger の headers に、旧 Authorization（v_anon_key）の 1 組を
-- x-mmq-cron-secret の直前へ戻す。適用前の md5(prosrc) は d7e05da311cceeb8c9dd4b20b7a00690（2026-11-04 本番）。
-- 注意: 旧 API キーが無効なままなら、戻すと新規貸切申込の Discord 通知が gateway で再び 401 になる。
-- 定義の全文は読み出さない。既に Authorization があれば何もしない。トリガー本体は触らない。
DO $$
DECLARE
  v_oid oid;
  v_def text;
  v_new text;
BEGIN
  SELECT p.oid INTO v_oid FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'notify_private_booking_discord_trigger';
  IF v_oid IS NULL THEN
    RETURN;
  END IF;
  v_def := pg_get_functiondef(v_oid);
  IF v_def ~* '''Authorization''' THEN
    RETURN;
  END IF;
  IF (SELECT count(*) FROM regexp_matches(v_def, '''x-mmq-cron-secret''', 'g')) <> 1 THEN
    RAISE WARNING 'notify_private_booking_discord_trigger: x-mmq-cron-secret の位置が特定できないため戻さない';
    RETURN;
  END IF;
  v_new := replace(v_def, '''x-mmq-cron-secret''',
    '''Authorization'',     ''Bearer '' || v_anon_key,' || E'\n    ' || '''x-mmq-cron-secret''');
  EXECUTE v_new;
END
$$;

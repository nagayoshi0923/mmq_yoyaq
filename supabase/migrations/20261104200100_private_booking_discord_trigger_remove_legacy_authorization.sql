-- 貸切申込の Discord 通知トリガー関数から旧 Authorization だけを外す。
-- 旧 anon キー（legacy JWT）が無効化され、pg_net からの呼び出しが gateway で 401 になっている。
-- 関数側の認証は x-mmq-cron-secret（app_config.trigger_secret の参照）で行うため、それは残す。
-- 現在の定義を DB 内で読み、該当の 1 組だけを除いて同じ定義で置き換える（所有者・権限・SECURITY DEFINER・
-- search_path は定義に含まれ維持される）。トリガー本体（発火条件）は触らない。
-- 想定外の形なら何も変えずに WARNING を出す。適用済みなら何もしない。
DO $$
DECLARE
  v_oid oid;
  v_cnt int;
  v_def text;
  v_new text;
  v_n int;
  c_pat constant text := '''Authorization''\s*,\s*''Bearer ''\s*\|\|\s*v_anon_key\s*,\s*';
BEGIN
  SELECT count(*), min(p.oid) INTO v_cnt, v_oid
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'notify_private_booking_discord_trigger';
  IF v_cnt = 0 THEN
    RAISE NOTICE 'notify_private_booking_discord_trigger が無いため skip';
    RETURN;
  END IF;
  IF v_cnt <> 1 THEN
    RAISE WARNING 'notify_private_booking_discord_trigger が % 件あるため変更しない', v_cnt;
    RETURN;
  END IF;
  v_def := pg_get_functiondef(v_oid);
  IF v_def !~* '''Authorization''' THEN
    RAISE NOTICE '適用済み（Authorization 無し）';
    RETURN;
  END IF;
  SELECT count(*) INTO v_n FROM regexp_matches(v_def, c_pat, 'gi');
  IF v_n <> 1 THEN
    RAISE WARNING 'notify_private_booking_discord_trigger: 想定外の形（一致 % 件）のため変更しない', v_n;
    RETURN;
  END IF;
  v_new := regexp_replace(v_def, c_pat, '', 'i');
  IF v_new ~* '''Authorization'''
     OR v_new !~* '''x-mmq-cron-secret'''
     OR v_new !~* 'trigger_secret'
     OR v_new !~* '/functions/v1/notify-private-booking-discord' THEN
    RAISE WARNING 'notify_private_booking_discord_trigger: 置換後の確認に失敗したため変更しない';
    RETURN;
  END IF;
  EXECUTE v_new;
END
$$;

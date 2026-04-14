-- =============================================================================
-- 20260415110000: app_config テーブルを追加し Discord trigger を修正
-- =============================================================================
--
-- 前のmigration (20260415100000) で current_setting 方式を採用したが、
-- ALTER DATABASE にスーパーユーザー権限が必要なため app_config テーブル方式に変更。
--
-- 各環境での初期設定（このmigration適用後に1回だけ実行）:
--
--   【ステージング】
--   INSERT INTO public.app_config (key, value) VALUES
--     ('supabase_url', 'https://lavutzztfqbdndjiwluc.supabase.co'),
--     ('supabase_anon_key', '<staging anon key>')
--   ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;
--
--   【本番】
--   INSERT INTO public.app_config (key, value) VALUES
--     ('supabase_url', 'https://cznpcewciwywcqcxktba.supabase.co'),
--     ('supabase_anon_key', '<production anon key>')
--   ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;
--
-- =============================================================================

-- 1. 環境設定テーブルを作成
CREATE TABLE IF NOT EXISTS public.app_config (
  key   text PRIMARY KEY,
  value text NOT NULL
);

ALTER TABLE public.app_config ENABLE ROW LEVEL SECURITY;

-- service_role のみ読み書き可
DROP POLICY IF EXISTS "service_role only" ON public.app_config;
CREATE POLICY "service_role only" ON public.app_config
  USING (auth.role() = 'service_role');

-- 2. wrapper 関数を app_config から読む方式に更新
CREATE OR REPLACE FUNCTION public.notify_private_booking_discord_trigger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_base_url       text;
  v_anon_key       text;
  v_trigger_secret text;
  v_body           jsonb;
BEGIN
  SELECT value INTO v_base_url       FROM public.app_config WHERE key = 'supabase_url';
  SELECT value INTO v_anon_key       FROM public.app_config WHERE key = 'supabase_anon_key';
  SELECT value INTO v_trigger_secret FROM public.app_config WHERE key = 'trigger_secret';

  IF v_base_url IS NULL THEN
    RAISE WARNING 'app_config.supabase_url が設定されていないため Discord 通知をスキップしました';
    RETURN NEW;
  END IF;

  v_body := jsonb_build_object(
    'type',   'INSERT',
    'table',  'reservations',
    'schema', 'public',
    'record', row_to_json(NEW)::jsonb
  );

  PERFORM net.http_post(
    url     := v_base_url || '/functions/v1/notify-private-booking-discord',
    body    := v_body,
    headers := jsonb_build_object(
      'Content-type',      'application/json',
      'Authorization',     'Bearer ' || v_anon_key,
      'x-mmq-cron-secret', v_trigger_secret
    )
  );

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'Discord 通知エラー（予約処理は続行）: %', SQLERRM;
  RETURN NEW;
END;
$$;

-- =============================================================================
-- 20260415100000: Discord通知トリガーを環境変数から URL を読む方式に変更
-- =============================================================================
--
-- 背景:
--   以前のトリガーは本番プロジェクトの URL をハードコードしていたため、
--   ステージング DB で貸切予約を作ると本番の Edge Function に通知が飛んでいた。
--
-- 解決策:
--   app_config テーブルに環境ごとの supabase_url / supabase_anon_key を持たせ、
--   wrapper 関数からそれを読む。migration 適用後に各環境で INSERT するだけでよい。
--
-- 各環境での初期設定（migration 適用後に1回だけ実行）:
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

-- service_role のみ読み書き可（anon / authenticated からは隠す）
ALTER TABLE public.app_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role only" ON public.app_config
  USING (auth.role() = 'service_role');

-- 2. wrapper 関数を作成
CREATE OR REPLACE FUNCTION public.notify_private_booking_discord_trigger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_base_url  text;
  v_anon_key  text;
  v_url       text;
  v_headers   text;
BEGIN
  SELECT value INTO v_base_url FROM public.app_config WHERE key = 'supabase_url';
  SELECT value INTO v_anon_key FROM public.app_config WHERE key = 'supabase_anon_key';

  -- 設定値が未投入の場合はスキップ（エラーにしない）
  IF v_base_url IS NULL THEN
    RAISE WARNING 'app_config.supabase_url が設定されていないため Discord 通知をスキップしました';
    RETURN NEW;
  END IF;

  v_url     := v_base_url || '/functions/v1/notify-private-booking-discord';
  v_headers := jsonb_build_object(
    'Content-type', 'application/json',
    'Authorization', 'Bearer ' || v_anon_key
  )::text;

  PERFORM supabase_functions.http_request(v_url, 'POST', v_headers, '{}', '1000');

  RETURN NEW;
END;
$$;

-- 2. 旧トリガー（URL ハードコード）を削除
DROP TRIGGER IF EXISTS "private-booking-notification" ON public.reservations;

-- 3. wrapper 関数を使う新トリガーを作成
CREATE TRIGGER "private-booking-notification"
  AFTER INSERT ON public.reservations
  FOR EACH ROW
  WHEN (NEW.candidate_datetimes IS NOT NULL)
  EXECUTE FUNCTION public.notify_private_booking_discord_trigger();

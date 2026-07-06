-- 20260706190000: 開催決定メール対応
--
-- 公演中止判定 Edge Function で「開催決定（confirmed）」時にお客様へ
-- 開催決定メールを送信できるようにする。
--   1) email_settings に performance_confirmation_template カラムを追加（任意カスタム文面）
--   2) email_logs.email_type に 'performance_confirmation' を追加（送信ログ用）

-- 1) 開催決定メールテンプレート列
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'email_settings'
    AND column_name = 'performance_confirmation_template'
  ) THEN
    ALTER TABLE public.email_settings
    ADD COLUMN performance_confirmation_template TEXT;

    COMMENT ON COLUMN public.email_settings.performance_confirmation_template IS '定員到達による公演開催決定メールテンプレート';
  END IF;
END $$;

-- 2) email_logs.email_type に performance_confirmation を追加
ALTER TABLE public.email_logs
  DROP CONSTRAINT IF EXISTS email_logs_email_type_check;

ALTER TABLE public.email_logs
  ADD CONSTRAINT email_logs_email_type_check
  CHECK (email_type IN (
    'reservation_confirmed',
    'reservation_cancelled',
    'reservation_changed',
    'reservation_request',
    'reminder',
    'gm_notification',
    'staff_invitation',
    'waitlist_confirmed',
    'guest_pin',
    'performance_cancellation',
    'performance_confirmation',
    'license_report',
    'contact_inquiry',
    'coupon_granted',
    'other'
  ));

DO $$
BEGIN
  RAISE NOTICE '✅ 開催決定メール: performance_confirmation_template 列 / email_type を追加';
END $$;

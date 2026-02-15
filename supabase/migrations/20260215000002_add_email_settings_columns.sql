-- email_settings テーブルに不足カラムを追加
ALTER TABLE public.email_settings
ADD COLUMN IF NOT EXISTS from_email TEXT,
ADD COLUMN IF NOT EXISTS from_name TEXT,
ADD COLUMN IF NOT EXISTS cancellation_template TEXT,
ADD COLUMN IF NOT EXISTS reminder_template TEXT,
ADD COLUMN IF NOT EXISTS reminder_enabled BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS reminder_schedule TEXT,
ADD COLUMN IF NOT EXISTS reminder_time TEXT,
ADD COLUMN IF NOT EXISTS reminder_send_time TEXT,
ADD COLUMN IF NOT EXISTS reservation_confirmation_template TEXT;

COMMENT ON COLUMN public.email_settings.from_email IS '送信元メールアドレス';
COMMENT ON COLUMN public.email_settings.from_name IS '送信元名';
COMMENT ON COLUMN public.email_settings.cancellation_template IS 'キャンセルメールテンプレート';
COMMENT ON COLUMN public.email_settings.reminder_template IS 'リマインダーメールテンプレート';
COMMENT ON COLUMN public.email_settings.reminder_enabled IS 'リマインダー有効フラグ';
COMMENT ON COLUMN public.email_settings.reservation_confirmation_template IS '予約確認メールテンプレート';

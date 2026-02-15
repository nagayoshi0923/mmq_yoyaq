-- customers テーブルに notification_settings カラムを追加
ALTER TABLE public.customers
ADD COLUMN IF NOT EXISTS notification_settings JSONB DEFAULT '{"email_notifications": true, "reminder_notifications": true, "campaign_notifications": true}'::jsonb;

COMMENT ON COLUMN public.customers.notification_settings IS '通知設定';

-- customersテーブルに通知設定カラムを追加
ALTER TABLE customers 
ADD COLUMN IF NOT EXISTS notification_settings JSONB DEFAULT '{
  "email_notifications": true,
  "reminder_notifications": true,
  "campaign_notifications": true
}'::jsonb;

-- コメント
COMMENT ON COLUMN customers.notification_settings IS '通知設定（email_notifications: メール通知, reminder_notifications: リマインダー, campaign_notifications: キャンペーン通知）';


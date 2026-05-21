-- email_settings に店舗都合キャンセルメールテンプレートカラムを追加
ALTER TABLE email_settings
  ADD COLUMN IF NOT EXISTS store_cancellation_template TEXT;

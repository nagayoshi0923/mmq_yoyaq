-- 却下時のシステムメッセージ設定カラムを追加
ALTER TABLE global_settings 
ADD COLUMN IF NOT EXISTS system_msg_booking_rejected_title TEXT,
ADD COLUMN IF NOT EXISTS system_msg_booking_rejected_body TEXT;

-- コメント
COMMENT ON COLUMN global_settings.system_msg_booking_rejected_title IS '却下時のシステムメッセージタイトル';
COMMENT ON COLUMN global_settings.system_msg_booking_rejected_body IS '却下時のシステムメッセージ本文';

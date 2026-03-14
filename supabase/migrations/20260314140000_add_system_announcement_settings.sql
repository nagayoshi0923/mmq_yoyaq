-- =============================================================================
-- 20260314140000: システムアナウンス設定カラムを追加
-- =============================================================================
--
-- 背景:
-- - グループチャットに送信されるシステムメッセージの文言を
--   管理画面から設定できるようにする
--
-- =============================================================================

-- グループ作成時のメッセージ
ALTER TABLE global_settings
ADD COLUMN IF NOT EXISTS system_msg_group_created_title TEXT DEFAULT '貸切リクエストグループを作成しました';

ALTER TABLE global_settings
ADD COLUMN IF NOT EXISTS system_msg_group_created_body TEXT DEFAULT '招待リンクを共有して、参加メンバーを招待してください。';

ALTER TABLE global_settings
ADD COLUMN IF NOT EXISTS system_msg_group_created_note TEXT DEFAULT '※ 全員を招待していなくても日程確定は可能ですが、当日は参加人数全員でお越しください。';

-- 予約申込時のメッセージ
ALTER TABLE global_settings
ADD COLUMN IF NOT EXISTS system_msg_booking_requested_title TEXT DEFAULT '貸切リクエストを送信しました';

ALTER TABLE global_settings
ADD COLUMN IF NOT EXISTS system_msg_booking_requested_body TEXT DEFAULT '店舗より日程確定のご連絡をいたしますので、しばらくお待ちください。';

-- 日程確定時のメッセージ
ALTER TABLE global_settings
ADD COLUMN IF NOT EXISTS system_msg_schedule_confirmed_title TEXT DEFAULT '日程が確定いたしました';

ALTER TABLE global_settings
ADD COLUMN IF NOT EXISTS system_msg_schedule_confirmed_body TEXT DEFAULT 'ご予約ありがとうございます。当日のご来店をお待ちしております。';

-- コメント
COMMENT ON COLUMN global_settings.system_msg_group_created_title IS 'グループ作成時のシステムメッセージ - タイトル';
COMMENT ON COLUMN global_settings.system_msg_group_created_body IS 'グループ作成時のシステムメッセージ - 本文';
COMMENT ON COLUMN global_settings.system_msg_group_created_note IS 'グループ作成時のシステムメッセージ - 注記';
COMMENT ON COLUMN global_settings.system_msg_booking_requested_title IS '予約申込時のシステムメッセージ - タイトル';
COMMENT ON COLUMN global_settings.system_msg_booking_requested_body IS '予約申込時のシステムメッセージ - 本文';
COMMENT ON COLUMN global_settings.system_msg_schedule_confirmed_title IS '日程確定時のシステムメッセージ - タイトル';
COMMENT ON COLUMN global_settings.system_msg_schedule_confirmed_body IS '日程確定時のシステムメッセージ - 本文';

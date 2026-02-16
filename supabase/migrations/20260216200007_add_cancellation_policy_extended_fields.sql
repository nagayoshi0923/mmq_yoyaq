-- キャンセルポリシー拡張フィールドを追加
-- 店舗都合キャンセル、中止判定、予約変更、返金方法などの設定

ALTER TABLE public.reservation_settings
ADD COLUMN IF NOT EXISTS organizer_cancel_reasons JSONB DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS organizer_cancel_refund_note TEXT DEFAULT '参加料金は全額返金いたします。',
ADD COLUMN IF NOT EXISTS cancellation_judgment_rules JSONB DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS cancellation_notice_note TEXT DEFAULT '中止が決定した場合、ご登録のメールアドレスに自動でお知らせします。中止の場合、参加料金は一切発生しません。',
ADD COLUMN IF NOT EXISTS reservation_change_deadline_hours INTEGER DEFAULT 24,
ADD COLUMN IF NOT EXISTS reservation_change_note TEXT DEFAULT '参加人数の変更は、マイページから公演開始24時間前まで無料で行えます。日程の変更をご希望の場合は、一度キャンセルの上、再度ご予約をお願いいたします。',
ADD COLUMN IF NOT EXISTS refund_method_note TEXT DEFAULT '当日現地決済のため、事前にお支払いいただく金額はありません。キャンセル料が発生した場合は、次回ご来店時にお支払いいただくか、別途ご連絡させていただきます。',
ADD COLUMN IF NOT EXISTS policy_updated_at DATE DEFAULT CURRENT_DATE;

-- コメント追加
COMMENT ON COLUMN public.reservation_settings.organizer_cancel_reasons IS '店舗都合キャンセル理由の配列';
COMMENT ON COLUMN public.reservation_settings.organizer_cancel_refund_note IS '店舗都合キャンセル時の返金説明';
COMMENT ON COLUMN public.reservation_settings.cancellation_judgment_rules IS '中止判定ルールの配列';
COMMENT ON COLUMN public.reservation_settings.cancellation_notice_note IS '中止時の連絡方法説明';
COMMENT ON COLUMN public.reservation_settings.reservation_change_deadline_hours IS '予約変更可能期限（時間前）';
COMMENT ON COLUMN public.reservation_settings.reservation_change_note IS '予約変更に関する説明';
COMMENT ON COLUMN public.reservation_settings.refund_method_note IS '返金方法の説明';
COMMENT ON COLUMN public.reservation_settings.policy_updated_at IS 'ポリシー最終更新日';

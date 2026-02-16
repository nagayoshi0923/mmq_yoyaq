-- 貸切公演用のキャンセル設定カラムを追加
ALTER TABLE public.reservation_settings
ADD COLUMN IF NOT EXISTS private_cancellation_policy TEXT,
ADD COLUMN IF NOT EXISTS private_cancellation_deadline_hours INTEGER DEFAULT 48,
ADD COLUMN IF NOT EXISTS private_cancellation_fees JSONB;

COMMENT ON COLUMN public.reservation_settings.private_cancellation_policy IS '貸切公演のキャンセルポリシー文章';
COMMENT ON COLUMN public.reservation_settings.private_cancellation_deadline_hours IS '貸切公演のキャンセル受付期限（時間）';
COMMENT ON COLUMN public.reservation_settings.private_cancellation_fees IS '貸切公演のキャンセル料金設定';

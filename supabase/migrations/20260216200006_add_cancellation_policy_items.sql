-- キャンセルポリシー項目カラムを追加（項目ごとに管理可能に）
ALTER TABLE public.reservation_settings
ADD COLUMN IF NOT EXISTS cancellation_policy_items JSONB DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS private_cancellation_policy_items JSONB DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.reservation_settings.cancellation_policy_items IS '通常公演のキャンセルポリシー項目（配列）';
COMMENT ON COLUMN public.reservation_settings.private_cancellation_policy_items IS '貸切公演のキャンセルポリシー項目（配列）';

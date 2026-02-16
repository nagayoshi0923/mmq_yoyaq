-- pricing_settings テーブルに不足カラムを追加
ALTER TABLE public.pricing_settings
ADD COLUMN IF NOT EXISTS default_participation_fee INTEGER DEFAULT 3000,
ADD COLUMN IF NOT EXISTS time_based_pricing JSONB DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS early_bird_discount JSONB DEFAULT '{"enabled": false, "days": 7, "discount": 500}'::jsonb,
ADD COLUMN IF NOT EXISTS group_discount JSONB DEFAULT '{"enabled": false, "min_people": 6, "discount": 500}'::jsonb,
ADD COLUMN IF NOT EXISTS cancellation_fee JSONB DEFAULT '{"days_before": 3, "fee": 1000}'::jsonb;

COMMENT ON COLUMN public.pricing_settings.default_participation_fee IS 'デフォルト参加費（円）';
COMMENT ON COLUMN public.pricing_settings.time_based_pricing IS '時間帯別料金設定';
COMMENT ON COLUMN public.pricing_settings.early_bird_discount IS '早期予約割引設定';
COMMENT ON COLUMN public.pricing_settings.group_discount IS 'グループ割引設定';
COMMENT ON COLUMN public.pricing_settings.cancellation_fee IS 'キャンセル料設定';

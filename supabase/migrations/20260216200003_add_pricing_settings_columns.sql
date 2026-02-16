-- pricing_settings テーブルに不足カラムを追加
ALTER TABLE public.pricing_settings
ADD COLUMN IF NOT EXISTS default_participation_fee INTEGER DEFAULT 3000;

COMMENT ON COLUMN public.pricing_settings.default_participation_fee IS 'デフォルト参加費（円）';

-- booking_notices テーブルに複数店舗対応のカラムを追加
ALTER TABLE public.booking_notices
ADD COLUMN IF NOT EXISTS store_ids JSONB DEFAULT '[]'::jsonb;

-- 既存の store_id データを store_ids に移行
UPDATE public.booking_notices
SET store_ids = CASE 
  WHEN store_id IS NOT NULL THEN jsonb_build_array(store_id)
  ELSE '[]'::jsonb
END
WHERE store_ids = '[]'::jsonb OR store_ids IS NULL;

-- 事前読み込み条件フラグを追加
ALTER TABLE public.booking_notices
ADD COLUMN IF NOT EXISTS requires_pre_reading BOOLEAN DEFAULT false;

COMMENT ON COLUMN public.booking_notices.store_ids IS '有効店舗IDの配列（空の場合は全店舗共通）';
COMMENT ON COLUMN public.booking_notices.requires_pre_reading IS 'trueの場合、事前読み込みありのシナリオのみに表示';

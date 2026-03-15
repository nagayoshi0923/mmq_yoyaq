-- キャラクターに背景色と画像位置設定を追加
ALTER TABLE public.scenario_characters
ADD COLUMN IF NOT EXISTS background_color TEXT;

ALTER TABLE public.scenario_characters
ADD COLUMN IF NOT EXISTS image_position TEXT;

COMMENT ON COLUMN public.scenario_characters.background_color IS 'アイコン背景色（透明画像用）';
COMMENT ON COLUMN public.scenario_characters.image_position IS '画像表示位置（top, center, bottom）';

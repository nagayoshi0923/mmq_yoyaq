-- scenario_characters テーブルに url カラムを追加
-- キャラクターごとの関連URL（資料等）を保存するため

ALTER TABLE public.scenario_characters
ADD COLUMN IF NOT EXISTS url TEXT;

COMMENT ON COLUMN public.scenario_characters.url IS 'キャラクター関連URL（資料等）';

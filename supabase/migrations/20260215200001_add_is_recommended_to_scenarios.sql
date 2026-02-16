-- シナリオにおすすめフラグを追加
ALTER TABLE public.scenarios 
ADD COLUMN IF NOT EXISTS is_recommended BOOLEAN DEFAULT FALSE;

-- コメント追加
COMMENT ON COLUMN public.scenarios.is_recommended IS '管理者が設定するおすすめフラグ';

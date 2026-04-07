-- private_groups に配役方法カラムを追加
ALTER TABLE public.private_groups
ADD COLUMN IF NOT EXISTS character_assignment_method TEXT NOT NULL DEFAULT 'survey'
CHECK (character_assignment_method IN ('survey', 'self'));

COMMENT ON COLUMN public.private_groups.character_assignment_method IS '配役方法: survey=アンケートで希望を聞く, self=参加者同士で決める';

DO $$ 
BEGIN
  RAISE NOTICE '✅ 配役方法カラム（character_assignment_method）を追加しました';
END $$;

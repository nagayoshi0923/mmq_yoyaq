-- private_groups に配役方法と配役結果を追加（グループ単位で管理）
-- 前回のマイグレーションで削除されたカラムを再追加（NULLデフォルト=未選択）
ALTER TABLE public.private_groups
ADD COLUMN IF NOT EXISTS character_assignment_method TEXT DEFAULT NULL
CHECK (character_assignment_method IS NULL OR character_assignment_method IN ('survey', 'self'));

ALTER TABLE public.private_groups
ADD COLUMN IF NOT EXISTS character_assignments JSONB DEFAULT NULL;

COMMENT ON COLUMN public.private_groups.character_assignment_method IS '配役方法: NULL=未選択, survey=アンケートで決める, self=自分たちで決める';
COMMENT ON COLUMN public.private_groups.character_assignments IS '各メンバーのキャラクター選択結果 {member_id: character_id}';

DO $$ 
BEGIN
  RAISE NOTICE '✅ private_groups に配役方法・配役結果カラムを追加しました';
END $$;

-- アンケート質問タイプに rating（5段階評価）を追加
ALTER TABLE public.org_scenario_survey_questions
DROP CONSTRAINT IF EXISTS org_scenario_survey_questions_question_type_check;

ALTER TABLE public.org_scenario_survey_questions
ADD CONSTRAINT org_scenario_survey_questions_question_type_check
CHECK (question_type IN ('text', 'single_choice', 'multiple_choice', 'character_selection', 'rating'));

COMMENT ON COLUMN public.org_scenario_survey_questions.question_type IS 'text=自由記述, single_choice=単一選択, multiple_choice=複数選択, character_selection=キャラクター選択, rating=5段階評価';

DO $$ 
BEGIN
  RAISE NOTICE '✅ アンケート質問タイプに rating を追加しました';
END $$;

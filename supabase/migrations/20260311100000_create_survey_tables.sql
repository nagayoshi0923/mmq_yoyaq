-- 公演前アンケート機能: 質問テーブルと回答テーブルを作成
-- 作成日: 2026-03-11

-- =============================================================================
-- 1. org_scenarios に survey_deadline_days カラムを追加
-- =============================================================================
ALTER TABLE public.organization_scenarios 
ADD COLUMN IF NOT EXISTS survey_deadline_days INTEGER DEFAULT 1;

COMMENT ON COLUMN public.organization_scenarios.survey_deadline_days IS '公演の何日前までアンケート回答を受け付けるか（1=前日まで, 0=当日まで）';

-- =============================================================================
-- 2. org_scenario_survey_questions テーブル（質問テンプレート）
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.org_scenario_survey_questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_scenario_id UUID NOT NULL REFERENCES public.organization_scenarios(id) ON DELETE CASCADE,
  question_text TEXT NOT NULL,
  question_type TEXT NOT NULL CHECK (question_type IN ('text', 'single_choice', 'multiple_choice', 'character_selection')),
  options JSONB DEFAULT '[]',
  is_required BOOLEAN NOT NULL DEFAULT false,
  order_num INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.org_scenario_survey_questions IS 'シナリオごとの公演前アンケート質問テンプレート';
COMMENT ON COLUMN public.org_scenario_survey_questions.question_type IS 'text=自由記述, single_choice=単一選択, multiple_choice=複数選択, character_selection=キャラクター選択';
COMMENT ON COLUMN public.org_scenario_survey_questions.options IS '選択肢: [{ "value": "A", "label": "選択肢A" }, ...]';
COMMENT ON COLUMN public.org_scenario_survey_questions.is_required IS '必須回答かどうか';
COMMENT ON COLUMN public.org_scenario_survey_questions.order_num IS '表示順序';

CREATE INDEX IF NOT EXISTS idx_org_scenario_survey_questions_org_scenario_id 
  ON public.org_scenario_survey_questions(org_scenario_id);

-- =============================================================================
-- 3. private_group_survey_responses テーブル（回答）
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.private_group_survey_responses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID NOT NULL REFERENCES public.private_groups(id) ON DELETE CASCADE,
  member_id UUID NOT NULL REFERENCES public.private_group_members(id) ON DELETE CASCADE,
  responses JSONB NOT NULL DEFAULT '{}',
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(group_id, member_id)
);

COMMENT ON TABLE public.private_group_survey_responses IS 'グループメンバーのアンケート回答';
COMMENT ON COLUMN public.private_group_survey_responses.responses IS '回答内容: { "question_id": "回答内容", ... }';

CREATE INDEX IF NOT EXISTS idx_private_group_survey_responses_group_id 
  ON public.private_group_survey_responses(group_id);
CREATE INDEX IF NOT EXISTS idx_private_group_survey_responses_member_id 
  ON public.private_group_survey_responses(member_id);

-- =============================================================================
-- 4. RLS ポリシー
-- =============================================================================

-- org_scenario_survey_questions
ALTER TABLE public.org_scenario_survey_questions ENABLE ROW LEVEL SECURITY;

-- スタッフは組織内の質問を閲覧可能
CREATE POLICY "org_scenario_survey_questions_select_staff" ON public.org_scenario_survey_questions
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.organization_scenarios os
      JOIN public.staff s ON s.organization_id = os.organization_id
      WHERE os.id = org_scenario_id
        AND s.user_id = auth.uid()
    )
  );

-- 顧客はグループのシナリオの質問を閲覧可能
CREATE POLICY "org_scenario_survey_questions_select_customer" ON public.org_scenario_survey_questions
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.organization_scenarios os
      JOIN public.private_groups pg ON pg.scenario_id = os.scenario_master_id AND pg.organization_id = os.organization_id
      JOIN public.private_group_members pgm ON pgm.group_id = pg.id
      WHERE os.id = org_scenario_id
        AND pgm.user_id = auth.uid()
    )
  );

-- スタッフは組織内の質問を作成・更新・削除可能
CREATE POLICY "org_scenario_survey_questions_insert_staff" ON public.org_scenario_survey_questions
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.organization_scenarios os
      JOIN public.staff s ON s.organization_id = os.organization_id
      WHERE os.id = org_scenario_id
        AND s.user_id = auth.uid()
    )
  );

CREATE POLICY "org_scenario_survey_questions_update_staff" ON public.org_scenario_survey_questions
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.organization_scenarios os
      JOIN public.staff s ON s.organization_id = os.organization_id
      WHERE os.id = org_scenario_id
        AND s.user_id = auth.uid()
    )
  );

CREATE POLICY "org_scenario_survey_questions_delete_staff" ON public.org_scenario_survey_questions
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.organization_scenarios os
      JOIN public.staff s ON s.organization_id = os.organization_id
      WHERE os.id = org_scenario_id
        AND s.user_id = auth.uid()
    )
  );

-- private_group_survey_responses
ALTER TABLE public.private_group_survey_responses ENABLE ROW LEVEL SECURITY;

-- グループメンバーは自分の回答を閲覧・作成・更新可能
CREATE POLICY "private_group_survey_responses_select_member" ON public.private_group_survey_responses
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.private_group_members pgm
      WHERE pgm.id = member_id
        AND pgm.user_id = auth.uid()
    )
  );

-- グループ主催者は全メンバーの回答を閲覧可能
CREATE POLICY "private_group_survey_responses_select_organizer" ON public.private_group_survey_responses
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.private_groups pg
      WHERE pg.id = group_id
        AND pg.organizer_id = auth.uid()
    )
  );

-- スタッフは組織内のグループの回答を閲覧可能
CREATE POLICY "private_group_survey_responses_select_staff" ON public.private_group_survey_responses
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.private_groups pg
      JOIN public.staff s ON s.organization_id = pg.organization_id
      WHERE pg.id = group_id
        AND s.user_id = auth.uid()
    )
  );

-- メンバーは自分の回答を作成可能
CREATE POLICY "private_group_survey_responses_insert_member" ON public.private_group_survey_responses
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.private_group_members pgm
      WHERE pgm.id = member_id
        AND pgm.user_id = auth.uid()
    )
  );

-- メンバーは自分の回答を更新可能
CREATE POLICY "private_group_survey_responses_update_member" ON public.private_group_survey_responses
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.private_group_members pgm
      WHERE pgm.id = member_id
        AND pgm.user_id = auth.uid()
    )
  );

-- メンバーは自分の回答を削除可能
CREATE POLICY "private_group_survey_responses_delete_member" ON public.private_group_survey_responses
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.private_group_members pgm
      WHERE pgm.id = member_id
        AND pgm.user_id = auth.uid()
    )
  );

-- =============================================================================
-- 5. updated_at トリガー
-- =============================================================================
CREATE OR REPLACE FUNCTION public.update_org_scenario_survey_questions_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_org_scenario_survey_questions_updated_at
  BEFORE UPDATE ON public.org_scenario_survey_questions
  FOR EACH ROW
  EXECUTE FUNCTION public.update_org_scenario_survey_questions_updated_at();

CREATE OR REPLACE FUNCTION public.update_private_group_survey_responses_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_private_group_survey_responses_updated_at
  BEFORE UPDATE ON public.private_group_survey_responses
  FOR EACH ROW
  EXECUTE FUNCTION public.update_private_group_survey_responses_updated_at();

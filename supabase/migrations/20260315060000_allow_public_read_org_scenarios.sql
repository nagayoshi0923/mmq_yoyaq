-- organization_scenariosテーブルに公開読み取りポリシーを追加
-- アンケート機能のため、ゲストユーザーもシナリオ設定を読み取れるようにする

-- 既存のポリシーを確認し、公開読み取りを許可
DO $$ 
BEGIN
  -- 公開読み取りポリシーが存在しない場合のみ作成
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'organization_scenarios' 
    AND policyname = 'organization_scenarios_public_select'
  ) THEN
    CREATE POLICY organization_scenarios_public_select ON public.organization_scenarios
      FOR SELECT
      USING (true);
    RAISE NOTICE 'organization_scenarios_public_select ポリシーを作成しました';
  ELSE
    RAISE NOTICE 'organization_scenarios_public_select ポリシーは既に存在します';
  END IF;
END $$;

-- org_scenario_survey_questionsテーブルにも公開読み取りポリシーを追加
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'org_scenario_survey_questions' 
    AND policyname = 'org_scenario_survey_questions_public_select'
  ) THEN
    CREATE POLICY org_scenario_survey_questions_public_select ON public.org_scenario_survey_questions
      FOR SELECT
      USING (true);
    RAISE NOTICE 'org_scenario_survey_questions_public_select ポリシーを作成しました';
  ELSE
    RAISE NOTICE 'org_scenario_survey_questions_public_select ポリシーは既に存在します';
  END IF;
END $$;

-- private_group_survey_responsesテーブルにも公開読み書きポリシーを追加
-- （グループメンバーがアンケートに回答できるようにする）
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'private_group_survey_responses' 
    AND policyname = 'private_group_survey_responses_public_select'
  ) THEN
    CREATE POLICY private_group_survey_responses_public_select ON public.private_group_survey_responses
      FOR SELECT
      USING (true);
    RAISE NOTICE 'private_group_survey_responses_public_select ポリシーを作成しました';
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'private_group_survey_responses' 
    AND policyname = 'private_group_survey_responses_public_insert'
  ) THEN
    CREATE POLICY private_group_survey_responses_public_insert ON public.private_group_survey_responses
      FOR INSERT
      WITH CHECK (true);
    RAISE NOTICE 'private_group_survey_responses_public_insert ポリシーを作成しました';
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'private_group_survey_responses' 
    AND policyname = 'private_group_survey_responses_public_update'
  ) THEN
    CREATE POLICY private_group_survey_responses_public_update ON public.private_group_survey_responses
      FOR UPDATE
      USING (true);
    RAISE NOTICE 'private_group_survey_responses_public_update ポリシーを作成しました';
  END IF;
END $$;

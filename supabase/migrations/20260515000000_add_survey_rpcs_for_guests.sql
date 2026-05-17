-- ====================================================================
-- ゲストメンバー向けアンケートRPC追加
--
-- 問題: organization_scenarios / org_scenario_survey_questions /
--       private_group_survey_responses は全て auth.uid() IS NOT NULL
--       を必要とするRLSポリシーが設定されているため、Supabase未認証の
--       ゲストメンバーがアンケートを閲覧・回答できない。
--
-- 解決: SECURITY DEFINER RPC を経由してデータを返す。
--       p_member_id が p_group_id に属することを検証してからアクセスする。
-- ====================================================================

-- ====================================================================
-- 1. get_survey_data_for_member — アンケートデータ取得（ゲスト対応）
-- ====================================================================
CREATE OR REPLACE FUNCTION public.get_survey_data_for_member(
  p_group_id UUID,
  p_member_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_group RECORD;
  v_org_scenario RECORD;
  v_questions JSONB;
  v_existing_response RECORD;
  v_member_exists BOOLEAN;
BEGIN
  -- メンバーがグループに属しているか検証
  SELECT EXISTS(
    SELECT 1 FROM private_group_members
    WHERE id = p_member_id
      AND group_id = p_group_id
      AND status = 'joined'
  ) INTO v_member_exists;

  IF NOT v_member_exists THEN
    RAISE EXCEPTION 'Member does not belong to this group';
  END IF;

  -- グループのシナリオ情報を取得
  SELECT scenario_master_id, organization_id
  INTO v_group
  FROM private_groups
  WHERE id = p_group_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'group_not_found');
  END IF;

  -- organization_scenarios を scenario_master_id で検索
  SELECT id, survey_enabled, survey_deadline_days, characters
  INTO v_org_scenario
  FROM organization_scenarios
  WHERE scenario_master_id = v_group.scenario_master_id
    AND organization_id = v_group.organization_id
  LIMIT 1;

  -- 見つからなければ id で直接検索（scenario_master_id が org_scenario.id の場合）
  IF NOT FOUND THEN
    SELECT id, survey_enabled, survey_deadline_days, characters
    INTO v_org_scenario
    FROM organization_scenarios
    WHERE id = v_group.scenario_master_id
    LIMIT 1;
  END IF;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'scenario_not_found');
  END IF;

  IF NOT COALESCE(v_org_scenario.survey_enabled, false) THEN
    RETURN jsonb_build_object('survey_enabled', false);
  END IF;

  -- 質問を取得（order_num 順）
  SELECT jsonb_agg(
    jsonb_build_object(
      'id', q.id,
      'org_scenario_id', q.org_scenario_id,
      'question_text', q.question_text,
      'question_type', q.question_type,
      'options', q.options,
      'is_required', q.is_required,
      'order_num', q.order_num,
      'created_at', q.created_at,
      'updated_at', q.updated_at
    ) ORDER BY q.order_num
  )
  INTO v_questions
  FROM org_scenario_survey_questions q
  WHERE q.org_scenario_id = v_org_scenario.id;

  -- 既存の回答を取得
  SELECT id, responses
  INTO v_existing_response
  FROM private_group_survey_responses
  WHERE group_id = p_group_id
    AND member_id = p_member_id;

  RETURN jsonb_build_object(
    'survey_enabled', true,
    'org_scenario_id', v_org_scenario.id,
    'survey_deadline_days', v_org_scenario.survey_deadline_days,
    'characters', COALESCE(v_org_scenario.characters, '[]'::jsonb),
    'questions', COALESCE(v_questions, '[]'::jsonb),
    'existing_response_id', v_existing_response.id,
    'existing_responses', v_existing_response.responses
  );
END;
$$;

COMMENT ON FUNCTION public.get_survey_data_for_member IS 'ゲスト含むグループメンバーのアンケートデータを返すRPC。member_idがgroup_idに属することを検証する。';

GRANT EXECUTE ON FUNCTION public.get_survey_data_for_member(UUID, UUID) TO anon;
GRANT EXECUTE ON FUNCTION public.get_survey_data_for_member(UUID, UUID) TO authenticated;

-- ====================================================================
-- 2. upsert_survey_response_for_member — アンケート回答の保存（ゲスト対応）
-- ====================================================================
CREATE OR REPLACE FUNCTION public.upsert_survey_response_for_member(
  p_group_id UUID,
  p_member_id UUID,
  p_responses JSONB
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_member_exists BOOLEAN;
  v_response_id UUID;
BEGIN
  -- メンバーがグループに属しているか検証
  SELECT EXISTS(
    SELECT 1 FROM private_group_members
    WHERE id = p_member_id
      AND group_id = p_group_id
      AND status = 'joined'
  ) INTO v_member_exists;

  IF NOT v_member_exists THEN
    RAISE EXCEPTION 'Member does not belong to this group';
  END IF;

  -- UNIQUE(group_id, member_id) を利用してUPSERT
  INSERT INTO private_group_survey_responses (group_id, member_id, responses)
  VALUES (p_group_id, p_member_id, p_responses)
  ON CONFLICT (group_id, member_id) DO UPDATE
    SET responses = EXCLUDED.responses,
        updated_at = NOW()
  RETURNING id INTO v_response_id;

  RETURN v_response_id;
END;
$$;

COMMENT ON FUNCTION public.upsert_survey_response_for_member IS 'ゲスト含むグループメンバーのアンケート回答をUPSERTするRPC。member_idがgroup_idに属することを検証する。';

GRANT EXECUTE ON FUNCTION public.upsert_survey_response_for_member(UUID, UUID, JSONB) TO anon;
GRANT EXECUTE ON FUNCTION public.upsert_survey_response_for_member(UUID, UUID, JSONB) TO authenticated;

DO $$
BEGIN
  RAISE NOTICE '✅ マイグレーション完了: ゲスト向けアンケートRPC追加';
  RAISE NOTICE '  - get_survey_data_for_member: アンケートデータ取得（anon/authenticated）';
  RAISE NOTICE '  - upsert_survey_response_for_member: アンケート回答保存（anon/authenticated）';
END $$;

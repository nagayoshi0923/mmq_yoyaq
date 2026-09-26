CREATE OR REPLACE FUNCTION public.get_survey_data_for_member(p_group_id uuid, p_member_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_group RECORD;
  v_org_scenario RECORD;
  v_questions JSONB;
  v_existing_response RECORD;
  v_member_exists BOOLEAN;
  v_settings jsonb;
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
    WHERE id = v_group.scenario_master_id AND organization_id = v_group.organization_id
    LIMIT 1;
  END IF;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'scenario_not_found');
  END IF;

  v_settings:=public.get_private_group_survey_settings(v_group.organization_id,p_group_id);
  SELECT id, survey_enabled, survey_deadline_days, characters INTO v_org_scenario
    FROM organization_scenarios WHERE id=(v_settings->>'org_scenario_id')::uuid AND organization_id=v_group.organization_id;
  IF NOT COALESCE((v_settings->>'survey_enabled')::boolean, false) THEN
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
    'survey_deadline_days', v_settings->'survey_deadline_days',
    'survey_url', v_settings->'survey_url',
    'survey_deadline_at', v_settings->'survey_deadline_at',
    'characters', COALESCE(v_org_scenario.characters, '[]'::jsonb),
    'questions', COALESCE(v_questions, '[]'::jsonb),
    'existing_response_id', v_existing_response.id,
    'existing_responses', v_existing_response.responses
  );
END;
$function$;

-- 配役方法リセット時にアンケート回答からcharacter_selection回答を削除するRPC
-- 他メンバーの回答を操作する必要があるため SECURITY DEFINER で実行
CREATE OR REPLACE FUNCTION clear_character_selection_from_survey(
  p_group_id UUID
) RETURNS void AS $$
DECLARE
  v_scenario_id UUID;
  v_org_id UUID;
  v_org_scenario_id UUID;
  v_question_id UUID;
BEGIN
  SELECT scenario_id, organization_id INTO v_scenario_id, v_org_id
  FROM private_groups WHERE id = p_group_id;

  IF v_scenario_id IS NULL OR v_org_id IS NULL THEN
    RETURN;
  END IF;

  SELECT id INTO v_org_scenario_id
  FROM organization_scenarios
  WHERE scenario_master_id = v_scenario_id AND organization_id = v_org_id
  LIMIT 1;

  IF v_org_scenario_id IS NULL THEN
    SELECT id INTO v_org_scenario_id
    FROM organization_scenarios WHERE id = v_scenario_id
    LIMIT 1;
  END IF;

  IF v_org_scenario_id IS NULL THEN
    RETURN;
  END IF;

  SELECT id INTO v_question_id
  FROM org_scenario_survey_questions
  WHERE org_scenario_id = v_org_scenario_id AND question_type = 'character_selection'
  LIMIT 1;

  IF v_question_id IS NULL THEN
    RETURN;
  END IF;

  -- 該当グループの全メンバーの回答からcharacter_selectionキーを除去
  UPDATE private_group_survey_responses
  SET responses = responses - v_question_id::TEXT,
      updated_at = now()
  WHERE group_id = p_group_id
    AND responses ? v_question_id::TEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION clear_character_selection_from_survey(UUID) TO anon, authenticated;

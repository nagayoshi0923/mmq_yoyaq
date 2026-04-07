-- 配役確定時にアンケート回答(character_selection)として一括保存するRPC
-- 主催者が他メンバーの回答を書く必要があるため SECURITY DEFINER で実行
-- character_selection質問がなければ自動作成する
CREATE OR REPLACE FUNCTION upsert_character_assignments_to_survey(
  p_group_id UUID,
  p_assignments JSONB  -- { "member_id": "character_id", ... }
) RETURNS void AS $$
DECLARE
  v_scenario_id UUID;
  v_org_id UUID;
  v_org_scenario_id UUID;
  v_question_id UUID;
  v_member_id TEXT;
  v_char_id TEXT;
  v_existing_responses JSONB;
  v_existing_id UUID;
  v_max_order INT;
BEGIN
  -- グループからscenario_idとorganization_idを取得
  SELECT scenario_id, organization_id INTO v_scenario_id, v_org_id
  FROM private_groups WHERE id = p_group_id;

  IF v_scenario_id IS NULL OR v_org_id IS NULL THEN
    RETURN;
  END IF;

  -- organization_scenariosを検索（scenario_master_id で）
  SELECT id INTO v_org_scenario_id
  FROM organization_scenarios
  WHERE scenario_master_id = v_scenario_id AND organization_id = v_org_id
  LIMIT 1;

  -- 見つからなければ id で検索
  IF v_org_scenario_id IS NULL THEN
    SELECT id INTO v_org_scenario_id
    FROM organization_scenarios WHERE id = v_scenario_id
    LIMIT 1;
  END IF;

  IF v_org_scenario_id IS NULL THEN
    RETURN;
  END IF;

  -- character_selection タイプの質問を検索
  SELECT id INTO v_question_id
  FROM org_scenario_survey_questions
  WHERE org_scenario_id = v_org_scenario_id AND question_type = 'character_selection'
  LIMIT 1;

  -- 質問がなければ自動作成
  IF v_question_id IS NULL THEN
    SELECT coalesce(max(order_num), 0) INTO v_max_order
    FROM org_scenario_survey_questions
    WHERE org_scenario_id = v_org_scenario_id;

    INSERT INTO org_scenario_survey_questions (org_scenario_id, question_text, question_type, options, is_required, order_num)
    VALUES (v_org_scenario_id, '希望キャラクター', 'character_selection', '[]'::jsonb, false, v_max_order + 1)
    RETURNING id INTO v_question_id;
  END IF;

  -- 各メンバーの回答をupsert
  FOR v_member_id, v_char_id IN
    SELECT key, value #>> '{}' FROM jsonb_each(p_assignments)
  LOOP
    -- 既存回答を取得
    SELECT id, responses INTO v_existing_id, v_existing_responses
    FROM private_group_survey_responses
    WHERE group_id = p_group_id AND member_id = v_member_id::UUID;

    IF v_existing_id IS NOT NULL THEN
      UPDATE private_group_survey_responses
      SET responses = coalesce(v_existing_responses, '{}'::jsonb) || jsonb_build_object(v_question_id::TEXT, v_char_id),
          updated_at = now()
      WHERE id = v_existing_id;
    ELSE
      INSERT INTO private_group_survey_responses (group_id, member_id, responses)
      VALUES (p_group_id, v_member_id::UUID, jsonb_build_object(v_question_id::TEXT, v_char_id));
    END IF;
  END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION upsert_character_assignments_to_survey(UUID, JSONB) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.clear_character_selection_from_survey(p_group_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_scenario_id UUID;
  v_org_id UUID;
  v_org_scenario_id UUID;
  v_question_id UUID;
BEGIN
  SELECT scenario_master_id, organization_id INTO v_scenario_id, v_org_id
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

  UPDATE private_group_survey_responses
  SET responses = responses - v_question_id::TEXT,
      updated_at = now()
  WHERE group_id = p_group_id
    AND responses ? v_question_id::TEXT;
END;
$function$;
CREATE OR REPLACE FUNCTION public.upsert_character_assignments_to_survey(p_group_id uuid, p_assignments jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
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
  SELECT scenario_master_id, organization_id INTO v_scenario_id, v_org_id
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
    SELECT coalesce(max(order_num), 0) INTO v_max_order
    FROM org_scenario_survey_questions
    WHERE org_scenario_id = v_org_scenario_id;

    INSERT INTO org_scenario_survey_questions (org_scenario_id, question_text, question_type, options, is_required, order_num)
    VALUES (v_org_scenario_id, '希望キャラクター', 'character_selection', '[]'::jsonb, false, v_max_order + 1)
    RETURNING id INTO v_question_id;
  END IF;

  FOR v_member_id, v_char_id IN
    SELECT key, value #>> '{}' FROM jsonb_each(p_assignments)
  LOOP
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
$function$;
DROP TRIGGER IF EXISTS guard_private_group_browser_write ON public.private_group_members;
DROP TRIGGER IF EXISTS guard_private_group_browser_write ON public.private_group_candidate_dates;
DROP TRIGGER IF EXISTS guard_private_group_browser_write ON public.private_group_date_responses;
DROP TRIGGER IF EXISTS guard_private_group_browser_write ON public.private_group_messages;
DROP TRIGGER IF EXISTS guard_private_group_browser_write ON public.private_group_survey_responses;
DROP FUNCTION IF EXISTS public.guard_private_group_browser_write();
DROP FUNCTION IF EXISTS public.require_private_group_manager(uuid);
DROP FUNCTION IF EXISTS public.private_group_actor_role(uuid);
GRANT EXECUTE ON FUNCTION public.save_guest_access_pin(uuid,text) TO anon,authenticated;
GRANT EXECUTE ON FUNCTION public.delete_guest_member(uuid) TO PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.delete_guest_member(uuid,text) TO PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.get_survey_data_for_member(uuid,uuid) TO PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_survey_response_for_member(uuid,uuid,jsonb) TO PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.set_character_preference(uuid,text,text) TO PUBLIC,anon,authenticated;

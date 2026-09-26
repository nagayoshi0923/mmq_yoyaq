-- QW-20260917-001 A02/A03. Install together with the authenticated guest callers.
-- Existing RLS policies are unchanged; the trigger checks direct browser writes.
CREATE FUNCTION public.private_group_actor_role(p_group_id uuid)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_group record;
BEGIN
 IF auth.uid() IS NULL THEN RETURN NULL; END IF;
 SELECT organizer_id,organization_id INTO v_group FROM private_groups WHERE id=p_group_id FOR UPDATE;
 IF NOT FOUND THEN RETURN NULL; END IF;
 IF v_group.organizer_id=auth.uid() THEN RETURN 'organizer'; END IF;
 IF EXISTS(SELECT 1 FROM users WHERE id=auth.uid() AND role IN ('admin','staff') AND organization_id=v_group.organization_id)
 AND NOT EXISTS(SELECT 1 FROM staff WHERE user_id=auth.uid() AND status IN ('inactive','resigned')) THEN RETURN 'staff'; END IF;
 RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION public.private_group_actor_role(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.private_group_actor_role(uuid) TO authenticated,service_role;

CREATE FUNCTION public.require_private_group_manager(p_group_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF public.private_group_actor_role(p_group_id) IS NULL AND coalesce(auth.role(),'')<>'service_role' THEN
  RAISE EXCEPTION 'このグループを管理する権限がありません' USING ERRCODE='42501';
 END IF;
END $$;
REVOKE ALL ON FUNCTION public.require_private_group_manager(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.require_private_group_manager(uuid) TO authenticated,service_role;

CREATE FUNCTION public.guard_private_group_browser_write()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE v_row jsonb; v_group uuid; v_manager text; v_owner boolean; v_message jsonb; v_cap integer;
BEGIN
 -- Definer RPCs validate their own actor. Ordinary browser writes run as anon/authenticated.
 IF current_user NOT IN ('anon','authenticated') THEN
  IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
 END IF;
 IF auth.uid() IS NULL THEN RAISE EXCEPTION '本人確認が必要です。招待ページから入り直してください' USING ERRCODE='42501'; END IF;
 v_row:=CASE WHEN TG_OP='DELETE' THEN to_jsonb(OLD) ELSE to_jsonb(NEW) END;
 v_group:=(v_row->>'group_id')::uuid;
 IF TG_OP='UPDATE' AND (NEW.group_id IS DISTINCT FROM OLD.group_id OR NEW.id IS DISTINCT FROM OLD.id) THEN
  RAISE EXCEPTION '所属先・識別子を変更できません' USING ERRCODE='42501';
 END IF;
 PERFORM 1 FROM private_groups WHERE id=v_group FOR UPDATE;
 v_manager:=public.private_group_actor_role(v_group);
 IF TG_TABLE_NAME='private_group_members' THEN
  IF TG_OP<>'DELETE' AND NEW.status='joined' THEN
   SELECT s.player_count_max INTO v_cap FROM private_groups g JOIN organization_scenarios_with_master s ON s.organization_id=g.organization_id AND s.scenario_master_id=g.scenario_master_id WHERE g.id=v_group;
   IF v_cap IS NULL OR (SELECT count(*) FROM private_group_members WHERE group_id=v_group AND status='joined' AND id<>NEW.id)>=v_cap THEN
    RAISE EXCEPTION '参加人数が上限に達しています' USING ERRCODE='23514';
   END IF;
  END IF;
  IF TG_OP='INSERT' THEN
   -- The only direct insert left is the creator becoming the organizer. Joins use the atomic RPC.
   IF v_manager IS DISTINCT FROM 'organizer' OR NEW.user_id IS DISTINCT FROM auth.uid() OR NOT NEW.is_organizer
    OR EXISTS(SELECT 1 FROM private_group_members WHERE group_id=v_group AND is_organizer)
    OR NEW.coupon_id IS NOT NULL OR coalesce(NEW.coupon_discount,0)<>0 OR NEW.payment_status='paid' THEN
    RAISE EXCEPTION '招待ページから参加してください' USING ERRCODE='42501';
   END IF;
  ELSIF TG_OP='UPDATE' THEN
   IF v_manager IS DISTINCT FROM 'staff' THEN RAISE EXCEPTION '参加者情報の変更権限がありません' USING ERRCODE='42501'; END IF;
   IF NEW.user_id IS DISTINCT FROM OLD.user_id OR NEW.is_organizer IS DISTINCT FROM OLD.is_organizer THEN RAISE EXCEPTION '本人情報を変更できません' USING ERRCODE='42501'; END IF;
  ELSE
   IF OLD.is_organizer OR (v_manager IS NULL AND OLD.user_id IS DISTINCT FROM auth.uid()) THEN RAISE EXCEPTION '退出・削除の権限がありません' USING ERRCODE='42501'; END IF;
  END IF;
 ELSIF TG_TABLE_NAME='private_group_candidate_dates' THEN
  IF v_manager IS NULL THEN RAISE EXCEPTION '候補日を変更する権限がありません' USING ERRCODE='42501'; END IF;
 ELSE
  SELECT EXISTS(SELECT 1 FROM private_group_members WHERE id=(v_row->>'member_id')::uuid AND group_id=v_group AND user_id=auth.uid() AND status='joined') INTO v_owner;
  IF TG_OP='UPDATE' AND NEW.member_id IS DISTINCT FROM OLD.member_id THEN RAISE EXCEPTION '回答者・送信者を変更できません' USING ERRCODE='42501'; END IF;
  IF NOT v_owner AND v_manager IS NULL THEN RAISE EXCEPTION '本人の参加情報が必要です' USING ERRCODE='42501'; END IF;
  IF TG_TABLE_NAME='private_group_date_responses' THEN
   IF TG_OP<>'DELETE' AND NOT v_owner THEN RAISE EXCEPTION '本人の日程回答だけ変更できます' USING ERRCODE='42501'; END IF;
   IF TG_OP<>'DELETE' AND NOT EXISTS(SELECT 1 FROM private_group_candidate_dates WHERE id=NEW.candidate_date_id AND group_id=v_group) THEN RAISE EXCEPTION '別グループの日程には回答できません' USING ERRCODE='42501'; END IF;
  ELSIF TG_TABLE_NAME='private_group_messages' THEN
   IF TG_OP<>'DELETE' AND v_manager IS NULL AND NEW.message ~ '^\s*\{' THEN
    BEGIN
     v_message:=NEW.message::jsonb;
     IF v_message->>'type'='system' THEN RAISE EXCEPTION 'システム通知として送信できません' USING ERRCODE='42501'; END IF;
    EXCEPTION WHEN invalid_text_representation THEN NULL;
    END;
   END IF;
   IF TG_OP<>'DELETE' AND NOT EXISTS(SELECT 1 FROM private_group_members WHERE id=NEW.member_id AND group_id=v_group) AND NEW.member_id IS NOT NULL THEN RAISE EXCEPTION '別グループの送信者です' USING ERRCODE='42501'; END IF;
  ELSIF TG_TABLE_NAME='private_group_survey_responses' THEN
   IF TG_OP<>'DELETE' AND NOT v_owner AND v_manager IS DISTINCT FROM 'staff' THEN RAISE EXCEPTION '本人の回答だけ変更できます' USING ERRCODE='42501'; END IF;
   IF TG_OP<>'DELETE' AND NOT EXISTS(SELECT 1 FROM private_group_members WHERE id=NEW.member_id AND group_id=v_group) THEN RAISE EXCEPTION '別グループの回答者です' USING ERRCODE='42501'; END IF;
  END IF;
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END $$;
REVOKE ALL ON FUNCTION public.guard_private_group_browser_write() FROM PUBLIC;
CREATE TRIGGER guard_private_group_browser_write BEFORE INSERT OR UPDATE OR DELETE ON public.private_group_members FOR EACH ROW EXECUTE FUNCTION public.guard_private_group_browser_write();
CREATE TRIGGER guard_private_group_browser_write BEFORE INSERT OR UPDATE OR DELETE ON public.private_group_candidate_dates FOR EACH ROW EXECUTE FUNCTION public.guard_private_group_browser_write();
CREATE TRIGGER guard_private_group_browser_write BEFORE INSERT OR UPDATE OR DELETE ON public.private_group_date_responses FOR EACH ROW EXECUTE FUNCTION public.guard_private_group_browser_write();
CREATE TRIGGER guard_private_group_browser_write BEFORE INSERT OR UPDATE OR DELETE ON public.private_group_messages FOR EACH ROW EXECUTE FUNCTION public.guard_private_group_browser_write();
CREATE TRIGGER guard_private_group_browser_write BEFORE INSERT OR UPDATE OR DELETE ON public.private_group_survey_responses FOR EACH ROW EXECUTE FUNCTION public.guard_private_group_browser_write();

REVOKE EXECUTE ON FUNCTION public.save_guest_access_pin(uuid,text) FROM PUBLIC,anon,authenticated;
REVOKE EXECUTE ON FUNCTION public.delete_guest_member(uuid) FROM PUBLIC,anon,authenticated;
REVOKE EXECUTE ON FUNCTION public.delete_guest_member(uuid,text) FROM PUBLIC,anon,authenticated;
REVOKE EXECUTE ON FUNCTION public.get_survey_data_for_member(uuid,uuid) FROM PUBLIC,anon,authenticated;
REVOKE EXECUTE ON FUNCTION public.upsert_survey_response_for_member(uuid,uuid,jsonb) FROM PUBLIC,anon,authenticated;
REVOKE EXECUTE ON FUNCTION public.set_character_preference(uuid,text,text) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.clear_character_selection_from_survey(p_group_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO public
AS $function$
DECLARE
  v_scenario_id UUID;
  v_org_id UUID;
  v_org_scenario_id UUID;
  v_question_id UUID;
BEGIN
  PERFORM public.require_private_group_manager(p_group_id);
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
 SET search_path TO public
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
  PERFORM public.require_private_group_manager(p_group_id);
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

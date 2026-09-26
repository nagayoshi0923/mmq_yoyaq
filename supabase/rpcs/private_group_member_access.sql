-- Canonical guest access RPCs and browser write guards. See migrations 20260927006000/06100.
-- QW-20260917-001 A02/A03. Additive phase; enforce legacy/direct paths after callers migrate.
CREATE TABLE public.private_group_guest_sessions (
 token_hash text PRIMARY KEY,
 member_id uuid NOT NULL REFERENCES public.private_group_members(id) ON DELETE CASCADE,
 expires_at timestamptz NOT NULL,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
ALTER TABLE public.private_group_guest_sessions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.private_group_guest_sessions FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.private_group_guest_sessions TO service_role;
CREATE INDEX private_group_guest_sessions_member_idx ON public.private_group_guest_sessions(member_id);

CREATE FUNCTION public.issue_private_group_guest_session(p_member_id uuid)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,extensions AS $$
DECLARE v_token text;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM private_group_members WHERE id=p_member_id AND user_id IS NULL AND status='joined') THEN
  RAISE EXCEPTION 'Guest member not found' USING ERRCODE='42501';
 END IF;
 v_token:=encode(extensions.gen_random_bytes(32),'hex');
 DELETE FROM private_group_guest_sessions WHERE member_id=p_member_id AND expires_at<=clock_timestamp();
 INSERT INTO private_group_guest_sessions(token_hash,member_id,expires_at)
 VALUES(encode(extensions.digest(v_token,'sha256'),'hex'),p_member_id,clock_timestamp()+interval '30 days');
 RETURN v_token;
END $$;
REVOKE ALL ON FUNCTION public.issue_private_group_guest_session(uuid) FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.authenticate_guest_by_pin_v3(p_group_id uuid,p_email text,p_pin text)
RETURNS TABLE(member_id uuid,guest_name text,guest_email text,locked boolean,guest_token text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_result record;
BEGIN
 FOR v_result IN SELECT * FROM public.authenticate_guest_by_pin_v2(p_group_id,p_email,p_pin) LOOP
  RETURN QUERY SELECT v_result.member_id,v_result.guest_name,v_result.guest_email,v_result.locked,
    CASE WHEN v_result.member_id IS NOT NULL AND NOT v_result.locked
      THEN public.issue_private_group_guest_session(v_result.member_id) ELSE NULL::text END;
 END LOOP;
END $$;
REVOKE ALL ON FUNCTION public.authenticate_guest_by_pin_v3(uuid,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.authenticate_guest_by_pin_v3(uuid,text,text) TO anon,authenticated,service_role;

CREATE FUNCTION public.require_private_group_member(p_group_id uuid,p_member_id uuid,p_guest_token text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,extensions AS $$
DECLARE v_user uuid;
BEGIN
 SELECT user_id INTO v_user FROM private_group_members WHERE id=p_member_id AND group_id=p_group_id AND status='joined' FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION '参加情報が見つかりません。招待ページから入り直してください' USING ERRCODE='42501'; END IF;
 IF v_user IS NOT NULL AND v_user=auth.uid() THEN RETURN; END IF;
 IF v_user IS NULL AND p_guest_token IS NOT NULL AND length(p_guest_token)=64 AND EXISTS(
  SELECT 1 FROM private_group_guest_sessions WHERE member_id=p_member_id
  AND token_hash=encode(extensions.digest(p_guest_token,'sha256'),'hex') AND expires_at>clock_timestamp()
 ) THEN RETURN; END IF;
 RAISE EXCEPTION '本人確認が必要です。メールアドレスとPINで入り直してください' USING ERRCODE='42501';
END $$;
REVOKE ALL ON FUNCTION public.require_private_group_member(uuid,uuid,text) FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.join_private_group(p_invite_code text,p_guest_name text DEFAULT NULL,p_guest_email text DEFAULT NULL,p_guest_phone text DEFAULT NULL,p_pin text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,extensions AS $$
DECLARE v_group record; v_member public.private_group_members; v_user uuid:=auth.uid(); v_email text:=lower(trim(p_guest_email)); v_cap integer; v_min integer; v_name text:=nullif(trim(p_guest_name),''); v_token text;
BEGIN
 SELECT * INTO v_group FROM private_groups WHERE invite_code=p_invite_code FOR UPDATE;
 IF NOT FOUND OR v_group.status='cancelled' THEN RAISE EXCEPTION 'この招待では参加できません' USING ERRCODE='22023'; END IF;
 IF v_user IS NULL AND (v_name IS NULL OR v_email IS NULL OR v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' OR length(v_email)>320 OR p_pin IS NULL OR p_pin !~ '^[0-9]{4}$') THEN
  RAISE EXCEPTION '名前・メールアドレス・4桁のPINが必要です' USING ERRCODE='22023';
 END IF;
 IF length(coalesce(v_name,''))>200 OR length(coalesce(p_guest_phone,''))>50 THEN RAISE EXCEPTION '入力が長すぎます' USING ERRCODE='22023'; END IF;
 IF EXISTS(SELECT 1 FROM private_group_members m LEFT JOIN private_group_members_pii pii ON pii.member_id=m.id
  WHERE m.group_id=v_group.id AND m.status='joined' AND ((v_user IS NOT NULL AND m.user_id=v_user) OR (v_user IS NULL AND lower(trim(pii.guest_email))=v_email))) THEN
  RAISE EXCEPTION '既にグループに参加しています。PIN認証から入り直してください' USING ERRCODE='23505';
 END IF;
 SELECT player_count_min,player_count_max INTO v_min,v_cap FROM organization_scenarios_with_master
 WHERE organization_id=v_group.organization_id AND scenario_master_id=v_group.scenario_master_id;
 IF v_cap IS NULL OR v_min IS NULL OR v_min<1 OR v_cap<v_min THEN
  RAISE EXCEPTION '作品の参加人数を確認できません。店舗にお問い合わせください' USING ERRCODE='22023';
 END IF;
 IF (SELECT count(*) FROM private_group_members WHERE group_id=v_group.id AND status='joined')>=v_cap THEN
  RAISE EXCEPTION '参加人数が上限（%名）に達しています',v_cap USING ERRCODE='23514';
 END IF;
 IF v_user IS NOT NULL THEN
  SELECT coalesce(nullif(nickname,''),nullif(name,'')) INTO v_name FROM customers WHERE user_id=v_user ORDER BY id LIMIT 1;
 END IF;
 INSERT INTO private_group_members(group_id,user_id,guest_name,guest_email,guest_phone,is_organizer,status,joined_at)
 VALUES(v_group.id,v_user,coalesce(v_name,'メンバー'),CASE WHEN v_user IS NULL THEN v_email END,CASE WHEN v_user IS NULL THEN p_guest_phone END,false,'joined',clock_timestamp()) RETURNING * INTO v_member;
 IF v_user IS NULL THEN
  PERFORM public.save_guest_access_pin(v_member.id,p_pin);
  v_token:=public.issue_private_group_guest_session(v_member.id);
 END IF;
 INSERT INTO private_group_messages(group_id,member_id,message) VALUES(v_group.id,v_member.id,
  jsonb_build_object('type','system','action','member_joined','memberName',coalesce(v_name,'メンバー'),'memberId',v_member.id)::text);
 RETURN jsonb_build_object('member',to_jsonb(v_member),'guest_token',v_token);
END $$;
REVOKE ALL ON FUNCTION public.join_private_group(text,text,text,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.join_private_group(text,text,text,text,text) TO anon,authenticated,service_role;

CREATE FUNCTION public.private_group_member_action(p_group_id uuid,p_member_id uuid,p_action text,p_payload jsonb DEFAULT '{}'::jsonb,p_guest_token text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_row jsonb; v_result uuid; v_message text;
BEGIN
 -- Lock the group before the member, consistently with join and future membership guards.
 PERFORM 1 FROM private_groups WHERE id=p_group_id FOR UPDATE;
 PERFORM public.require_private_group_member(p_group_id,p_member_id,p_guest_token);
 IF p_payload IS NULL OR octet_length(p_payload::text)>65536 THEN RAISE EXCEPTION '入力が長すぎます' USING ERRCODE='22023'; END IF;
 CASE p_action
 WHEN 'validate' THEN RETURN jsonb_build_object('valid',true);
 WHEN 'date_responses' THEN
  IF jsonb_typeof(p_payload)<>'array' OR jsonb_array_length(p_payload)>100 THEN RAISE EXCEPTION '日程回答が不正です' USING ERRCODE='22023'; END IF;
  FOR v_row IN SELECT value FROM jsonb_array_elements(p_payload) LOOP
   IF coalesce(v_row->>'response','') NOT IN ('ok','ng','maybe') OR NOT EXISTS(SELECT 1 FROM private_group_candidate_dates WHERE id=(v_row->>'candidateDateId')::uuid AND group_id=p_group_id) THEN
    RAISE EXCEPTION '回答対象の日程が見つかりません' USING ERRCODE='22023';
   END IF;
   INSERT INTO private_group_date_responses(group_id,member_id,candidate_date_id,response)
   VALUES(p_group_id,p_member_id,(v_row->>'candidateDateId')::uuid,v_row->>'response')
   ON CONFLICT(member_id,candidate_date_id) DO UPDATE SET response=EXCLUDED.response,updated_at=clock_timestamp();
  END LOOP;
  RETURN 'true'::jsonb;
 WHEN 'message' THEN
  v_message:=trim(p_payload->>'message');
  IF v_message IS NULL OR length(v_message)=0 OR length(v_message)>5000 THEN RAISE EXCEPTION 'メッセージは1〜5000文字で入力してください' USING ERRCODE='22023'; END IF;
  -- Guest/member messages are plain text, never impersonated system announcements.
  IF v_message ~ '^\s*\{' THEN
   BEGIN
    IF (v_message::jsonb)->>'type'='system' THEN RAISE EXCEPTION 'システム通知として送信できません' USING ERRCODE='42501'; END IF;
   EXCEPTION WHEN invalid_text_representation THEN NULL;
   END;
  END IF;
  INSERT INTO private_group_messages(group_id,member_id,message,sender_type) VALUES(p_group_id,p_member_id,v_message,'member') RETURNING id INTO v_result;
  RETURN to_jsonb(v_result);
 WHEN 'survey_read' THEN RETURN public.get_survey_data_for_member(p_group_id,p_member_id);
 WHEN 'survey_write' THEN
  IF jsonb_typeof(p_payload)<>'object' THEN RAISE EXCEPTION 'アンケート回答が不正です' USING ERRCODE='22023'; END IF;
  RETURN to_jsonb(public.upsert_survey_response_for_member(p_group_id,p_member_id,p_payload));
 WHEN 'character_preference' THEN
  IF length(coalesce(p_payload->>'characterId',''))>200 THEN RAISE EXCEPTION '配役希望が不正です' USING ERRCODE='22023'; END IF;
  PERFORM public.set_character_preference(p_group_id,p_member_id::text,p_payload->>'characterId');
  RETURN 'true'::jsonb;
 WHEN 'leave' THEN
  IF EXISTS(SELECT 1 FROM private_group_members WHERE id=p_member_id AND is_organizer) THEN RAISE EXCEPTION '主催者は退出できません' USING ERRCODE='42501'; END IF;
  DELETE FROM private_group_members WHERE id=p_member_id AND group_id=p_group_id;
  RETURN 'true'::jsonb;
 ELSE RAISE EXCEPTION '未対応の操作です' USING ERRCODE='22023';
 END CASE;
END $$;
REVOKE ALL ON FUNCTION public.private_group_member_action(uuid,uuid,text,jsonb,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.private_group_member_action(uuid,uuid,text,jsonb,text) TO anon,authenticated,service_role;

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

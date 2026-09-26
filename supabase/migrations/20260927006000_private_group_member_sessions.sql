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
 -- Match v2's deterministic member selection, but lock the member before its PII.
 -- Otherwise concurrent deletion can hold member -> wait PII while session FK waits member.
 PERFORM m.id FROM public.private_group_members m
 JOIN public.private_group_members_pii pii ON pii.member_id=m.id
 WHERE m.group_id=p_group_id AND m.user_id IS NULL AND m.status='joined'
 AND lower(pii.guest_email)=lower(trim(p_email))
 ORDER BY m.id LIMIT 1 FOR UPDATE OF m;
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

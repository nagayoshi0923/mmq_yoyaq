-- QW-20260917-001: 個別通知は本人と管理スタッフだけに返す。RLS・既存テーブル権限は別段階。
-- 個別通知の宛先判定に使用。通常のチャット本文（JSONでないもの）も保持する。
CREATE FUNCTION public.private_group_message_payload(p_message text)
RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SET search_path=public,pg_temp AS $$
BEGIN
 RETURN p_message::jsonb;
EXCEPTION WHEN invalid_text_representation THEN RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION public.private_group_message_payload(text) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.private_group_read_messages(p_group_id uuid,p_member_id uuid DEFAULT NULL,p_guest_token text DEFAULT NULL,p_before_created_at timestamptz DEFAULT NULL,p_before_id uuid DEFAULT NULL,p_limit integer DEFAULT 100)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE access_level text; own_members uuid[];
BEGIN
 access_level:=public.authorize_private_group_read(p_group_id,p_member_id,p_guest_token);
 SELECT coalesce(array_agg(id),'{}'::uuid[]) INTO own_members FROM public.private_group_members
 WHERE group_id=p_group_id AND user_id=auth.uid() AND status='joined';
 IF p_member_id IS NOT NULL AND NOT (p_member_id=ANY(own_members)) THEN
  BEGIN
   PERFORM public.require_private_group_member(p_group_id,p_member_id,p_guest_token);
   own_members:=array_append(own_members,p_member_id);
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
 END IF;
 IF p_limit IS NULL OR p_limit<1 OR p_limit>500 OR (p_before_created_at IS NULL)<>(p_before_id IS NULL) THEN
  RAISE EXCEPTION '履歴の取得条件が正しくありません' USING ERRCODE='22023';
 END IF;
 RETURN COALESCE((SELECT jsonb_agg(to_jsonb(m) ORDER BY m.created_at,m.id) FROM (
  SELECT id,group_id,member_id,message,created_at,sender_type FROM public.private_group_messages m
  WHERE group_id=p_group_id
   AND (access_level='staff' OR coalesce(public.private_group_message_payload(m.message)->>'action','')<>'individual_notice'
    OR public.private_group_message_payload(m.message)->>'target_member_id'=ANY(own_members::text[])
    OR (auth.uid() IS NOT NULL AND public.private_group_message_payload(m.message)->>'target_user_id'=auth.uid()::text))
   AND (p_before_created_at IS NULL OR (created_at,id)<(p_before_created_at,p_before_id)) ORDER BY created_at DESC,id DESC LIMIT p_limit
 ) m),'[]'::jsonb);
END $$;
REVOKE ALL ON FUNCTION public.private_group_read_messages(uuid,uuid,text,timestamptz,uuid,integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.private_group_read_messages(uuid,uuid,text,timestamptz,uuid,integer) TO anon,authenticated,service_role;


CREATE FUNCTION public.private_group_send_individual_notice(
 p_group_id uuid,p_member_id uuid,p_message text DEFAULT '',p_character_id text DEFAULT NULL,p_attach_template boolean DEFAULT false
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE
 g public.private_groups%ROWTYPE;
 member public.private_group_members%ROWTYPE;
 scenario record;
 character jsonb;
 template text;
 sender_name text;
 target_name text;
 body text;
 saved public.private_group_messages%ROWTYPE;
BEGIN
 IF public.private_group_actor_role(p_group_id) IS DISTINCT FROM 'staff' AND coalesce(auth.role(),'')<>'service_role' THEN
  RAISE EXCEPTION 'スタッフ権限が必要です' USING ERRCODE='42501';
 END IF;
 SELECT * INTO STRICT g FROM public.private_groups WHERE id=p_group_id FOR UPDATE;
 SELECT * INTO member FROM public.private_group_members WHERE id=p_member_id AND group_id=g.id AND status IN ('joined','active');
 IF NOT FOUND THEN RAISE EXCEPTION '宛先の参加状況が変更されています' USING ERRCODE='22023'; END IF;
 SELECT v.characters,v.individual_notice_template INTO scenario FROM public.organization_scenarios_with_master v
 WHERE v.organization_id=g.organization_id AND (v.scenario_master_id=g.scenario_master_id OR v.org_scenario_id=g.scenario_master_id)
 ORDER BY (v.scenario_master_id=g.scenario_master_id) DESC LIMIT 1;
 IF p_character_id IS NOT NULL AND p_character_id<>'' THEN
  SELECT c INTO character FROM jsonb_array_elements(coalesce(scenario.characters,'[]'::jsonb)) c WHERE c->>'id'=p_character_id;
  IF character IS NULL THEN RAISE EXCEPTION '作品のキャラクターが変更されています' USING ERRCODE='22023'; END IF;
 END IF;
 IF coalesce(p_attach_template,false) THEN
  template:=nullif(scenario.individual_notice_template,'');
  IF template IS NULL THEN SELECT individual_notice_default_body INTO template FROM public.global_settings WHERE organization_id=g.organization_id; END IF;
 END IF;
 body:=concat_ws(E'\n\n',nullif(btrim(p_message),''),nullif(template,''),nullif(character->>'survey_description',''),
  CASE WHEN nullif(character->>'url','') IS NOT NULL THEN '【'||coalesce(character->>'name','キャラクター')||E'の資料】\n'||(character->>'url') END);
 IF body='' AND character IS NULL THEN RAISE EXCEPTION 'お知らせの本文を入力してください' USING ERRCODE='22023'; END IF;
 target_name:=CASE WHEN member.user_id IS NULL THEN coalesce(nullif(member.guest_name,''),'参加者')
  ELSE coalesce((SELECT nullif(c.nickname,'') FROM public.customers c WHERE c.user_id=member.user_id ORDER BY c.id LIMIT 1),'ニックネーム未設定') END;
 SELECT name INTO sender_name FROM public.staff WHERE user_id=auth.uid() AND organization_id=g.organization_id AND (status IS NULL OR status NOT IN ('inactive','resigned')) ORDER BY id LIMIT 1;
 INSERT INTO public.private_group_messages(group_id,member_id,message) VALUES(g.id,member.id,jsonb_build_object(
  'type','system','action','individual_notice','target_member_id',member.id,'target_member_name',target_name,'target_user_id',member.user_id,
  'message',body,'character_id',character->>'id','character_name',character->>'name','character_url',character->>'url',
  'template_attached',coalesce(nullif(template,'') IS NOT NULL,false),'sent_by',sender_name)::text) RETURNING * INTO saved;
 RETURN to_jsonb(saved);
END $$;
REVOKE ALL ON FUNCTION public.private_group_send_individual_notice(uuid,uuid,text,text,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.private_group_send_individual_notice(uuid,uuid,text,text,boolean) TO authenticated,service_role;

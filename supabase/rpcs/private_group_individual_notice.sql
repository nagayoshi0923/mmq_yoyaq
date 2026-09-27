CREATE OR REPLACE FUNCTION public.private_group_send_individual_notice(
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

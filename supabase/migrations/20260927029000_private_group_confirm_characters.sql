-- QW-20260917-001: 配役・回答・通知を同一トランザクションで確定する。
-- 既存のRLS、テーブル権限、配役方式は変更しない。
CREATE FUNCTION public.private_group_confirm_characters(
 p_group_id uuid, p_assignments jsonb, p_expected_assignments jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
 g public.private_groups%ROWTYPE;
 chars jsonb;
 assignment record;
 active_count integer;
 required_count integer;
 org_scenario_id uuid;
 message_row public.private_group_messages%ROWTYPE;
 lines text;
BEGIN
 PERFORM public.require_private_group_manager(p_group_id);
 SELECT * INTO STRICT g FROM public.private_groups WHERE id=p_group_id FOR UPDATE;
 IF p_expected_assignments IS NULL OR coalesce(g.character_assignments,'{}'::jsonb) <> p_expected_assignments THEN
  RAISE EXCEPTION '配役の希望が更新されています。読み込み直して確認してください' USING ERRCODE='40001';
 END IF;
 IF p_assignments IS NULL OR jsonb_typeof(p_assignments)<>'object' THEN
  RAISE EXCEPTION '配役を指定してください' USING ERRCODE='22023';
 END IF;
 -- 同じ組織・作品の回答先を必ず解決し、旧RPCの別組織fallbackや無保存returnを防ぐ。
 SELECT id INTO STRICT org_scenario_id FROM public.organization_scenarios
 WHERE organization_id=g.organization_id AND scenario_master_id=g.scenario_master_id FOR UPDATE;
 SELECT v.characters,v.player_count_max INTO chars,required_count FROM public.organization_scenarios_with_master v
 WHERE v.organization_id=g.organization_id AND v.scenario_master_id=g.scenario_master_id;
 IF chars IS NULL OR jsonb_typeof(chars)<>'array' OR jsonb_array_length(chars)=0 THEN
  RAISE EXCEPTION '作品のキャラクター設定を確認してください' USING ERRCODE='22023';
 END IF;
 SELECT count(*) INTO active_count FROM public.private_group_members
 WHERE group_id=g.id AND status IN ('joined','active');
 IF active_count<coalesce(nullif(required_count,0),jsonb_array_length(chars)) THEN
  RAISE EXCEPTION '作品の必要人数が揃ってから配役を確定してください' USING ERRCODE='22023';
 END IF;
 IF active_count=0 OR (SELECT count(*) FROM jsonb_object_keys(p_assignments))<>active_count THEN
  RAISE EXCEPTION '参加メンバー全員の配役を選択してください' USING ERRCODE='22023';
 END IF;
 FOR assignment IN SELECT key,value FROM jsonb_each(p_assignments) LOOP
  IF jsonb_typeof(assignment.value)<>'string'
   OR NOT EXISTS(SELECT 1 FROM public.private_group_members m WHERE m.id::text=assignment.key AND m.group_id=g.id AND m.status IN ('joined','active'))
   OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(chars) c WHERE c->>'id'=assignment.value#>>'{}') THEN
   RAISE EXCEPTION '参加メンバーまたはキャラクターが変更されています' USING ERRCODE='22023';
  END IF;
 END LOOP;
 IF (SELECT count(DISTINCT value) FROM jsonb_each(p_assignments))<>active_count THEN
  RAISE EXCEPTION '同じキャラクターを複数人に割り当てることはできません' USING ERRCODE='22023';
 END IF;
 SELECT string_agg((CASE WHEN m.user_id IS NULL THEN coalesce(nullif(m.guest_name,''),'参加者') ELSE coalesce((SELECT nullif(c.nickname,'') FROM public.customers c WHERE c.user_id=m.user_id ORDER BY c.id LIMIT 1),'ニックネーム未設定') END)||' → '||(c->>'name')||
  CASE WHEN g.character_assignments->>m.id::text IS NOT NULL AND g.character_assignments->>m.id::text<>a.value THEN '（変更あり）' ELSE '' END,E'\n' ORDER BY m.created_at,m.id)
 INTO lines FROM public.private_group_members m
 JOIN jsonb_each_text(p_assignments) a ON a.key=m.id::text
 JOIN jsonb_array_elements(chars) c ON c->>'id'=a.value WHERE m.group_id=g.id;
 UPDATE public.private_groups SET character_assignments=p_assignments,updated_at=now() WHERE id=g.id;
 PERFORM public.upsert_character_assignments_to_survey(g.id,p_assignments);
 INSERT INTO public.private_group_messages(group_id,member_id,message)
 VALUES(g.id,NULL,jsonb_build_object('type','system','action','character_assignment','title','キャラクター配役が確定しました','body',lines,'assignments',p_assignments)::text)
 RETURNING * INTO message_row;
 RETURN to_jsonb(message_row);
END $$;
REVOKE ALL ON FUNCTION public.private_group_confirm_characters(uuid,jsonb,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.private_group_confirm_characters(uuid,jsonb,jsonb) TO authenticated,service_role;

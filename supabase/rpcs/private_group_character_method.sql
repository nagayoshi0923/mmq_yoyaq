-- QW-20260917-001: 配役方式・配役の初期化・アンケートの配役回答・通知を一括保存。
CREATE OR REPLACE FUNCTION public.private_group_set_character_method(
 p_group_id uuid,p_method text,p_expected_method text,p_expected_assignments jsonb
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE g public.private_groups%ROWTYPE;org_scenario uuid;question_ids text[];
BEGIN
 PERFORM public.require_private_group_manager(p_group_id);
 SELECT * INTO STRICT g FROM public.private_groups WHERE id=p_group_id FOR UPDATE;
 IF p_method IS NOT NULL AND p_method NOT IN ('survey','self') THEN RAISE EXCEPTION '配役方法が正しくありません' USING ERRCODE='22023'; END IF;
 IF g.character_assignment_method IS DISTINCT FROM p_expected_method OR coalesce(g.character_assignments,'{}'::jsonb) IS DISTINCT FROM coalesce(p_expected_assignments,'{}'::jsonb) THEN
  RAISE EXCEPTION '配役の状態が更新されています。読み込み直して確認してください' USING ERRCODE='40001';
 END IF;
 SELECT id INTO org_scenario FROM public.organization_scenarios
 WHERE organization_id=g.organization_id AND (scenario_master_id=g.scenario_master_id OR id=g.scenario_master_id)
 ORDER BY (scenario_master_id=g.scenario_master_id) DESC LIMIT 1;
 IF org_scenario IS NULL THEN RAISE EXCEPTION '作品の設定を確認してください' USING ERRCODE='22023'; END IF;
 SELECT array_agg(id::text) INTO question_ids FROM public.org_scenario_survey_questions WHERE org_scenario_id=org_scenario AND question_type='character_selection';
 UPDATE public.private_groups SET character_assignment_method=p_method,character_assignments=NULL,updated_at=now() WHERE id=g.id;
 IF question_ids IS NOT NULL THEN
  UPDATE public.private_group_survey_responses SET responses=coalesce(responses,'{}'::jsonb)-question_ids,updated_at=now() WHERE group_id=g.id;
 END IF;
 INSERT INTO public.private_group_messages(group_id,member_id,message) VALUES(g.id,NULL,jsonb_build_object(
  'type','system','action','character_method_selected','method',p_method,
  'title',CASE WHEN p_method IS NULL THEN '配役方法を変更します' ELSE '配役方法が選択されました' END,
  'body',CASE WHEN p_method IS NULL THEN '配役とキャラクター希望をリセットしました。配役方法を選び直してください。'
   WHEN p_method='survey' THEN '「アンケート」が選択されました。' ELSE '「自分たちで決める」が選択されました。' END)::text);
END $$;
REVOKE ALL ON FUNCTION public.private_group_set_character_method(uuid,text,text,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.private_group_set_character_method(uuid,text,text,jsonb) TO authenticated,service_role;

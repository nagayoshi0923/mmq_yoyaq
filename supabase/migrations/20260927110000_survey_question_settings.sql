-- Atomic staff management of scenario survey questions. Existing grants/RLS stay
-- intact during caller migration; no response records are changed here.
CREATE FUNCTION public.require_survey_question_staff(p_organization_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE actor uuid:=auth.uid(); actor_role text; actor_org uuid;
BEGIN
 SELECT role::text,organization_id INTO actor_role,actor_org FROM public.users WHERE id=actor;
 IF actor IS NOT NULL AND actor_role='license_admin' THEN RETURN; END IF;
 IF actor IS NOT NULL AND COALESCE(actor_role IN ('admin','staff') AND actor_org=p_organization_id,false)
 AND NOT (EXISTS(SELECT 1 FROM public.staff WHERE user_id=actor AND organization_id=actor_org)
  AND NOT EXISTS(SELECT 1 FROM public.staff WHERE user_id=actor AND organization_id=actor_org AND (status IS NULL OR status NOT IN ('inactive','resigned')))) THEN RETURN; END IF;
 RAISE EXCEPTION 'アンケート設定を操作する権限がありません' USING ERRCODE='42501';
END $$;
REVOKE ALL ON FUNCTION public.require_survey_question_staff(uuid) FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.read_survey_question_settings(p_org_scenario_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE org uuid; questions jsonb;
BEGIN
 SELECT organization_id INTO org FROM public.organization_scenarios WHERE id=p_org_scenario_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'アンケート設定を取得できません' USING ERRCODE='42501'; END IF;
 PERFORM public.require_survey_question_staff(org);
 SELECT COALESCE(jsonb_agg(to_jsonb(q) ORDER BY q.order_num,q.id),'[]'::jsonb) INTO questions
 FROM public.org_scenario_survey_questions q WHERE org_scenario_id=p_org_scenario_id;
 RETURN jsonb_build_object('questions',questions,'revision',md5(questions::text));
END $$;
REVOKE ALL ON FUNCTION public.read_survey_question_settings(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.read_survey_question_settings(uuid) TO authenticated,service_role;

CREATE FUNCTION public.save_survey_question_settings(p_org_scenario_id uuid,p_questions jsonb,p_revision text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE snapshot jsonb; q jsonb; option_item jsonb; ids uuid[]; question_id uuid;
BEGIN
 -- Authorize before taking any lock. The same read also verifies the scenario.
 snapshot:=public.read_survey_question_settings(p_org_scenario_id);
 IF p_questions IS NULL OR jsonb_typeof(p_questions)<>'array' THEN
  RAISE EXCEPTION '設問一覧の形式が正しくありません' USING ERRCODE='22023';
 END IF;
 -- Old clients and the character-assignment RPC still write this table directly.
 -- Exclude their writes for this short configuration transaction too. Never wait
 -- behind a live booking operation: the caller can retry after a conflict.
 LOCK TABLE public.org_scenario_survey_questions IN SHARE ROW EXCLUSIVE MODE NOWAIT;
 snapshot:=public.read_survey_question_settings(p_org_scenario_id);
 IF p_revision IS DISTINCT FROM snapshot->>'revision' THEN
  RAISE EXCEPTION '設問が別の操作で変更されました。画面を開き直して変更内容を確認してください' USING ERRCODE='40001';
 END IF;
 ids:=ARRAY[]::uuid[];
 FOR q IN SELECT value FROM jsonb_array_elements(p_questions) LOOP
  IF jsonb_typeof(q)<>'object' OR jsonb_typeof(q->'id') IS DISTINCT FROM 'string'
   OR jsonb_typeof(q->'question_text') IS DISTINCT FROM 'string' OR btrim(q->>'question_text')=''
   OR COALESCE(q->>'question_type','') NOT IN ('text','single_choice','multiple_choice','character_selection','rating')
   OR jsonb_typeof(q->'is_required') IS DISTINCT FROM 'boolean'
   OR jsonb_typeof(q->'options') IS DISTINCT FROM 'array' THEN
   RAISE EXCEPTION '設問の本文・種類・選択肢を確認してください' USING ERRCODE='22023';
  END IF;
  BEGIN question_id:=(q->>'id')::uuid;
  EXCEPTION WHEN invalid_text_representation THEN RAISE EXCEPTION '設問IDの形式が正しくありません' USING ERRCODE='22023'; END;
  IF question_id=ANY(ids) THEN RAISE EXCEPTION '設問IDが重複しています' USING ERRCODE='22023'; END IF;
  ids:=array_append(ids,question_id);
  IF EXISTS(SELECT 1 FROM public.org_scenario_survey_questions WHERE id=question_id AND org_scenario_id<>p_org_scenario_id) THEN
   RAISE EXCEPTION '別のシナリオの設問は更新できません' USING ERRCODE='42501';
  END IF;
  FOR option_item IN SELECT value FROM jsonb_array_elements(q->'options') LOOP
   IF jsonb_typeof(option_item)<>'object' OR jsonb_typeof(option_item->'value') IS DISTINCT FROM 'string'
    OR jsonb_typeof(option_item->'label') IS DISTINCT FROM 'string'
    OR btrim(option_item->>'value')='' OR btrim(option_item->>'label')='' THEN
    RAISE EXCEPTION '選択肢の値と表示名を入力してください' USING ERRCODE='22023';
   END IF;
  END LOOP;
  IF (SELECT count(*)<>count(DISTINCT value->>'value') FROM jsonb_array_elements(q->'options')) THEN
   RAISE EXCEPTION '選択肢の値が重複しています' USING ERRCODE='22023';
  END IF;
  IF q->>'question_type' IN ('single_choice','multiple_choice') AND jsonb_array_length(q->'options')=0 THEN
   RAISE EXCEPTION '選択式の設問には選択肢が必要です' USING ERRCODE='22023';
  END IF;
 END LOOP;
 DELETE FROM public.org_scenario_survey_questions WHERE org_scenario_id=p_org_scenario_id AND NOT(id=ANY(ids));
 INSERT INTO public.org_scenario_survey_questions(id,org_scenario_id,question_text,question_type,options,is_required,order_num)
 SELECT (value->>'id')::uuid,p_org_scenario_id,value->>'question_text',value->>'question_type',value->'options',(value->>'is_required')::boolean,ordinality::integer
 FROM jsonb_array_elements(p_questions) WITH ORDINALITY
 ON CONFLICT(id) DO UPDATE SET question_text=EXCLUDED.question_text,question_type=EXCLUDED.question_type,options=EXCLUDED.options,is_required=EXCLUDED.is_required,order_num=EXCLUDED.order_num;
 RETURN public.read_survey_question_settings(p_org_scenario_id);
END $$;
REVOKE ALL ON FUNCTION public.save_survey_question_settings(uuid,jsonb,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.save_survey_question_settings(uuid,jsonb,text) TO authenticated,service_role;

CREATE FUNCTION public.list_survey_question_sources(p_organization_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE result jsonb;
BEGIN
 PERFORM public.require_survey_question_staff(p_organization_id);
 SELECT COALESCE(jsonb_agg(to_jsonb(source) ORDER BY source.title,source.org_scenario_id),'[]'::jsonb) INTO result FROM (
  SELECT s.scenario_master_id AS id,s.id AS org_scenario_id,COALESCE(m.title,'不明なシナリオ') AS title,count(q.id) AS "questionCount"
  FROM public.organization_scenarios s LEFT JOIN public.scenario_masters m ON m.id=s.scenario_master_id
  JOIN public.org_scenario_survey_questions q ON q.org_scenario_id=s.id
  WHERE s.organization_id=p_organization_id
  GROUP BY s.id,s.scenario_master_id,m.title
 ) source;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.list_survey_question_sources(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.list_survey_question_sources(uuid) TO authenticated,service_role;

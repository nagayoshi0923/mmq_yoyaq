CREATE TABLE public.private_group_survey_deadlines (
 group_id uuid PRIMARY KEY REFERENCES public.private_groups(id) ON DELETE CASCADE,
 organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
 deadline_at timestamptz NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.private_group_survey_deadlines ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.private_group_survey_deadlines FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.private_group_survey_deadlines TO service_role;

-- 旧案内文の月日を公演日の直前の該当日へ復元する（年末年始もJSTで固定）。
CREATE OR REPLACE FUNCTION public.parse_announced_survey_deadline(p_message text,p_performance_date date)
RETURNS timestamptz LANGUAGE plpgsql IMMUTABLE SET search_path=public AS $$
DECLARE m text[]; d date;
BEGIN
 IF p_performance_date IS NULL THEN RETURN NULL; END IF;
 m:=regexp_match(p_message,'回答期限[:：][[:space:]]*([0-9]{1,2})月([0-9]{1,2})日');
 IF m IS NULL THEN RETURN NULL; END IF;
 d:=make_date(extract(year FROM p_performance_date)::integer,m[1]::integer,m[2]::integer);
 IF d>p_performance_date THEN d:=make_date(extract(year FROM p_performance_date)::integer-1,m[1]::integer,m[2]::integer); END IF;
 RETURN (d+time '23:59:59.999') AT TIME ZONE 'Asia/Tokyo';
EXCEPTION WHEN datetime_field_overflow THEN RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION public.parse_announced_survey_deadline(text,date) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.parse_announced_survey_deadline(text,date) TO service_role;

-- 内部専用。スタッフAPIは認証済み組織、参加者RPCは所属確認済みグループの組織を渡す。
CREATE OR REPLACE FUNCTION public.get_private_group_survey_settings(p_organization_id uuid,p_group_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE g record; sc record; r record; result jsonb; k text; deadline timestamptz; resolved_scenario uuid;
BEGIN
 SELECT * INTO g FROM private_groups WHERE id=p_group_id AND organization_id=p_organization_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'group not found' USING ERRCODE='42501'; END IF;
 SELECT id,characters INTO sc FROM organization_scenarios
 WHERE organization_id=p_organization_id AND (scenario_master_id=g.scenario_master_id OR id=g.scenario_master_id)
 ORDER BY (scenario_master_id=g.scenario_master_id) DESC LIMIT 1;
 IF NOT FOUND THEN RETURN jsonb_build_object('error','scenario_not_found','survey_enabled',false); END IF;
 SELECT CASE WHEN booking.schedule_event_id IS NOT NULL THEN e.store_id ELSE booking.store_id END AS store_id,booking.schedule_event_id,e.date AS performance_date,e.organization_scenario_id,COALESCE(e.scenario_master_id,e.scenario_id) AS event_master_id INTO r FROM reservations booking
 LEFT JOIN schedule_events e ON e.id=booking.schedule_event_id AND e.organization_id=booking.organization_id
 WHERE (booking.private_group_id=p_group_id OR booking.id=g.reservation_id) AND booking.organization_id=p_organization_id
   AND booking.status IN ('confirmed','gm_confirmed','checked_in','completed')
 ORDER BY booking.created_at DESC,booking.id LIMIT 1;
 resolved_scenario:=sc.id;
 IF r.schedule_event_id IS NOT NULL THEN
   resolved_scenario:=r.organization_scenario_id;
   IF resolved_scenario IS NULL AND r.event_master_id IS NOT NULL THEN
     SELECT id INTO resolved_scenario FROM organization_scenarios WHERE organization_id=p_organization_id AND scenario_master_id=r.event_master_id;
   END IF;
   IF resolved_scenario IS NOT NULL THEN
     SELECT id,characters INTO sc FROM organization_scenarios WHERE id=resolved_scenario AND organization_id=p_organization_id;
   END IF;
 END IF;
 result:=jsonb_build_object('org_scenario_id',sc.id,'characters',COALESCE(sc.characters,'[]'::jsonb));
 FOREACH k IN ARRAY ARRAY['survey_enabled','survey_deadline_days','survey_url'] LOOP
   result:=result||jsonb_build_object(k,public.resolve_operating_setting(p_organization_id,k,'null'::jsonb,r.store_id,resolved_scenario,r.schedule_event_id)->'value');
 END LOOP;
 SELECT deadline_at INTO deadline FROM private_group_survey_deadlines WHERE group_id=p_group_id AND organization_id=p_organization_id;
 IF deadline IS NULL AND r.performance_date IS NOT NULL THEN
   SELECT public.parse_announced_survey_deadline(m.message,r.performance_date) INTO deadline
   FROM private_group_messages m WHERE m.group_id=p_group_id
     AND (m.message ~ '"action"[[:space:]]*:[[:space:]]*"(survey_notice|pre_reading_notice)"')
     AND public.parse_announced_survey_deadline(m.message,r.performance_date) IS NOT NULL
   ORDER BY m.created_at,m.id LIMIT 1;
 END IF;
 IF deadline IS NULL AND r.performance_date IS NOT NULL THEN
   deadline:=((r.performance_date-(result->>'survey_deadline_days')::integer)+time '23:59:59.999') AT TIME ZONE 'Asia/Tokyo';
 END IF;
 RETURN result||jsonb_build_object('survey_deadline_at',deadline);
END $$;
REVOKE ALL ON FUNCTION public.get_private_group_survey_settings(uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.get_private_group_survey_settings(uuid,uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.get_private_groups_survey_settings(p_organization_id uuid,p_group_ids uuid[])
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF cardinality(p_group_ids)>100 OR EXISTS(SELECT 1 FROM unnest(p_group_ids) AS requested(group_id)
   WHERE NOT EXISTS(SELECT 1 FROM private_groups g WHERE g.id=requested.group_id AND g.organization_id=p_organization_id)) THEN
   RAISE EXCEPTION 'group not found' USING ERRCODE='42501';
 END IF;
 RETURN COALESCE((SELECT jsonb_object_agg(id,public.get_private_group_survey_settings(p_organization_id,id)) FROM unnest(p_group_ids) id),'{}'::jsonb);
END $$;
REVOKE ALL ON FUNCTION public.get_private_groups_survey_settings(uuid,uuid[]) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.get_private_groups_survey_settings(uuid,uuid[]) TO service_role;

CREATE OR REPLACE FUNCTION public.get_survey_data_for_member(p_group_id uuid, p_member_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_group RECORD;
  v_org_scenario RECORD;
  v_questions JSONB;
  v_existing_response RECORD;
  v_member_exists BOOLEAN;
  v_settings jsonb;
BEGIN
  -- メンバーがグループに属しているか検証
  SELECT EXISTS(
    SELECT 1 FROM private_group_members
    WHERE id = p_member_id
      AND group_id = p_group_id
      AND status = 'joined'
  ) INTO v_member_exists;

  IF NOT v_member_exists THEN
    RAISE EXCEPTION 'Member does not belong to this group';
  END IF;

  -- グループのシナリオ情報を取得
  SELECT scenario_master_id, organization_id
  INTO v_group
  FROM private_groups
  WHERE id = p_group_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'group_not_found');
  END IF;

  -- organization_scenarios を scenario_master_id で検索
  SELECT id, survey_enabled, survey_deadline_days, characters
  INTO v_org_scenario
  FROM organization_scenarios
  WHERE scenario_master_id = v_group.scenario_master_id
    AND organization_id = v_group.organization_id
  LIMIT 1;

  -- 見つからなければ id で直接検索（scenario_master_id が org_scenario.id の場合）
  IF NOT FOUND THEN
    SELECT id, survey_enabled, survey_deadline_days, characters
    INTO v_org_scenario
    FROM organization_scenarios
    WHERE id = v_group.scenario_master_id AND organization_id = v_group.organization_id
    LIMIT 1;
  END IF;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'scenario_not_found');
  END IF;

  v_settings:=public.get_private_group_survey_settings(v_group.organization_id,p_group_id);
  SELECT id, survey_enabled, survey_deadline_days, characters INTO v_org_scenario
    FROM organization_scenarios WHERE id=(v_settings->>'org_scenario_id')::uuid AND organization_id=v_group.organization_id;
  IF NOT COALESCE((v_settings->>'survey_enabled')::boolean, false) THEN
    RETURN jsonb_build_object('survey_enabled', false);
  END IF;

  -- 質問を取得（order_num 順）
  SELECT jsonb_agg(
    jsonb_build_object(
      'id', q.id,
      'org_scenario_id', q.org_scenario_id,
      'question_text', q.question_text,
      'question_type', q.question_type,
      'options', q.options,
      'is_required', q.is_required,
      'order_num', q.order_num,
      'created_at', q.created_at,
      'updated_at', q.updated_at
    ) ORDER BY q.order_num
  )
  INTO v_questions
  FROM org_scenario_survey_questions q
  WHERE q.org_scenario_id = v_org_scenario.id;

  -- 既存の回答を取得
  SELECT id, responses
  INTO v_existing_response
  FROM private_group_survey_responses
  WHERE group_id = p_group_id
    AND member_id = p_member_id;

  RETURN jsonb_build_object(
    'survey_enabled', true,
    'org_scenario_id', v_org_scenario.id,
    'survey_deadline_days', v_settings->'survey_deadline_days',
    'survey_url', v_settings->'survey_url',
    'survey_deadline_at', v_settings->'survey_deadline_at',
    'characters', COALESCE(v_org_scenario.characters, '[]'::jsonb),
    'questions', COALESCE(v_questions, '[]'::jsonb),
    'existing_response_id', v_existing_response.id,
    'existing_responses', v_existing_response.responses
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.freeze_private_group_survey_deadline(p_organization_id uuid,p_group_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE settings jsonb;
BEGIN
 PERFORM 1 FROM private_groups WHERE id=p_group_id AND organization_id=p_organization_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'group not found' USING ERRCODE='42501'; END IF;
 settings:=public.get_private_group_survey_settings(p_organization_id,p_group_id);
 IF (settings->>'survey_enabled')::boolean AND settings->>'survey_deadline_at' IS NOT NULL THEN
   INSERT INTO private_group_survey_deadlines(group_id,organization_id,deadline_at)
   VALUES(p_group_id,p_organization_id,(settings->>'survey_deadline_at')::timestamptz)
   ON CONFLICT(group_id) DO NOTHING;
 END IF;
 RETURN public.get_private_group_survey_settings(p_organization_id,p_group_id);
END $$;
REVOKE ALL ON FUNCTION public.freeze_private_group_survey_deadline(uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.freeze_private_group_survey_deadline(uuid,uuid) TO service_role;

-- 既に案内が存在するグループの期限だけを固定する。新規案内は送信前にfreeze RPCを呼ぶ。
INSERT INTO public.private_group_survey_deadlines(group_id,organization_id,deadline_at)
SELECT g.id,g.organization_id,(s.settings->>'survey_deadline_at')::timestamptz
FROM public.private_groups g
CROSS JOIN LATERAL (SELECT public.get_private_group_survey_settings(g.organization_id,g.id) AS settings) s
WHERE EXISTS(SELECT 1 FROM public.private_group_messages m WHERE m.group_id=g.id
 AND (m.message ~ '"action"[[:space:]]*:[[:space:]]*"(survey_notice|pre_reading_notice)"'))
 AND s.settings->>'survey_deadline_at' IS NOT NULL
ON CONFLICT(group_id) DO NOTHING;

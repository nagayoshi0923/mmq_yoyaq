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

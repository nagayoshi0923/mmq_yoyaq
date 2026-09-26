-- Retain dormant individual values when common inheritance is selected.
CREATE OR REPLACE FUNCTION public.save_scenario_recruitment_settings_v3(p_organization_id uuid,p_master_id uuid,p_actor_id uuid,p_enabled boolean,p_source text,p_mode text,p_value integer,p_deadline_minutes integer,p_expected_updated_at timestamptz,p_enabled_source text,p_deadline_source text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE s organization_scenarios%ROWTYPE; before_value jsonb; after_value jsonb;
BEGIN
 SELECT * INTO s FROM organization_scenarios WHERE organization_id=p_organization_id AND scenario_master_id=p_master_id FOR UPDATE;
 IF NOT FOUND THEN RETURN jsonb_build_object('success',false,'error','NOT_FOUND'); END IF;
 IF p_enabled_source='common' THEN p_enabled:=s.recruitment_extension_enabled; END IF;
 IF p_deadline_source='common' THEN p_deadline_minutes:=s.recruitment_deadline_minutes; END IF;
 IF p_source='common' THEN p_mode:=s.recruitment_target_mode; p_value:=s.recruitment_target_value; END IF;
 IF p_enabled_source IS NULL OR p_enabled_source NOT IN ('common','custom') OR p_deadline_source IS NULL OR p_deadline_source NOT IN ('common','custom') OR p_enabled IS NULL OR p_source IS NULL OR p_source NOT IN ('common','custom') OR recruitment_missing_limit(7,p_mode,p_value) IS NULL OR p_deadline_minutes IS NULL OR p_deadline_minutes NOT BETWEEN 1 AND 239 OR p_actor_id IS NULL THEN
  RETURN jsonb_build_object('success',false,'error','INVALID_SETTINGS');
 END IF;
 IF s.updated_at IS DISTINCT FROM p_expected_updated_at THEN RETURN jsonb_build_object('success',false,'error','CONFLICT'); END IF;
 before_value:=jsonb_build_object('enabled',s.recruitment_extension_enabled,'source',s.recruitment_target_source,'mode',s.recruitment_target_mode,'value',s.recruitment_target_value,'deadline_minutes',s.recruitment_deadline_minutes,'enabled_source',s.recruitment_enabled_source,'deadline_source',s.recruitment_deadline_source);
 after_value:=jsonb_build_object('enabled',p_enabled,'source',p_source,'mode',p_mode,'value',p_value,'deadline_minutes',p_deadline_minutes,'enabled_source',p_enabled_source,'deadline_source',p_deadline_source);
 IF before_value=after_value THEN RETURN jsonb_build_object('success',true,'unchanged',true); END IF;
 UPDATE organization_scenarios SET recruitment_enabled_source=p_enabled_source,recruitment_deadline_source=p_deadline_source,recruitment_extension_enabled=p_enabled,recruitment_target_source=p_source,recruitment_target_mode=p_mode,recruitment_target_value=p_value,
 recruitment_max_missing=CASE WHEN p_mode='count' THEN p_value ELSE recruitment_max_missing END,
 recruitment_deadline_minutes=p_deadline_minutes,updated_at=clock_timestamp() WHERE id=s.id AND organization_id=p_organization_id;
 INSERT INTO scenario_recruitment_setting_history(organization_id,organization_scenario_id,actor_id,before_settings,after_settings) VALUES(p_organization_id,s.id,p_actor_id,before_value,after_value);
 RETURN jsonb_build_object('success',true);
END;
$$;
REVOKE ALL ON FUNCTION public.save_scenario_recruitment_settings_v3(uuid,uuid,uuid,boolean,text,text,integer,integer,timestamptz,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.save_scenario_recruitment_settings_v3(uuid,uuid,uuid,boolean,text,text,integer,integer,timestamptz,text,text) TO service_role;


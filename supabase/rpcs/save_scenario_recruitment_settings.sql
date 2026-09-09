CREATE FUNCTION public.save_scenario_recruitment_settings(p_organization_id uuid,p_master_id uuid,p_actor_id uuid,p_enabled boolean,p_max_missing integer,p_deadline_minutes integer,p_expected_updated_at timestamptz)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE s organization_scenarios%ROWTYPE; before_value jsonb; after_value jsonb;
BEGIN
 IF p_enabled IS NULL OR p_max_missing IS NULL OR p_max_missing NOT BETWEEN 1 AND 20 OR p_deadline_minutes IS NULL OR p_deadline_minutes NOT BETWEEN 1 AND 239 OR p_actor_id IS NULL THEN
  RETURN jsonb_build_object('success',false,'error','INVALID_SETTINGS');
 END IF;
 SELECT * INTO s FROM organization_scenarios WHERE organization_id=p_organization_id AND scenario_master_id=p_master_id FOR UPDATE;
 IF NOT FOUND THEN RETURN jsonb_build_object('success',false,'error','NOT_FOUND'); END IF;
 IF s.updated_at IS DISTINCT FROM p_expected_updated_at THEN RETURN jsonb_build_object('success',false,'error','CONFLICT'); END IF;
 before_value:=jsonb_build_object('enabled',s.recruitment_extension_enabled,'max_missing',s.recruitment_max_missing,'deadline_minutes',s.recruitment_deadline_minutes);
 after_value:=jsonb_build_object('enabled',p_enabled,'max_missing',p_max_missing,'deadline_minutes',p_deadline_minutes);
 IF before_value=after_value THEN RETURN jsonb_build_object('success',true,'unchanged',true); END IF;
 UPDATE organization_scenarios SET recruitment_extension_enabled=p_enabled,recruitment_max_missing=p_max_missing,recruitment_deadline_minutes=p_deadline_minutes,updated_at=clock_timestamp() WHERE id=s.id AND organization_id=p_organization_id;
 INSERT INTO scenario_recruitment_setting_history(organization_id,organization_scenario_id,actor_id,before_settings,after_settings) VALUES(p_organization_id,s.id,p_actor_id,before_value,after_value);
 RETURN jsonb_build_object('success',true);
END;
$$;
REVOKE ALL ON FUNCTION public.save_scenario_recruitment_settings(uuid,uuid,uuid,boolean,integer,integer,timestamptz) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.save_scenario_recruitment_settings(uuid,uuid,uuid,boolean,integer,integer,timestamptz) TO service_role;

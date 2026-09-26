CREATE OR REPLACE FUNCTION public.resolve_preparation_minutes(p_organization_id uuid,p_store_id uuid,p_scenario_lookup_id uuid,p_event_id uuid DEFAULT NULL)
RETURNS integer LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE scenario_id uuid;
BEGIN
 IF p_event_id IS NOT NULL THEN
   RETURN (public.resolve_operating_setting(p_organization_id,'preparation_minutes','60'::jsonb,NULL,NULL,p_event_id)->>'value')::integer;
 END IF;
 SELECT s.id INTO scenario_id FROM organization_scenarios s WHERE s.organization_id=p_organization_id
   AND (s.id=p_scenario_lookup_id OR s.scenario_master_id=p_scenario_lookup_id)
 ORDER BY (s.id=p_scenario_lookup_id) DESC LIMIT 1;
 RETURN (public.resolve_operating_setting(p_organization_id,'preparation_minutes','60'::jsonb,p_store_id,scenario_id,NULL)->>'value')::integer;
END $$;
REVOKE ALL ON FUNCTION public.resolve_preparation_minutes(uuid,uuid,uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_preparation_minutes(uuid,uuid,uuid,uuid) TO service_role;

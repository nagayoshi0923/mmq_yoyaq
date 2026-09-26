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

DO $migration$
DECLARE definition text; function_oid oid;
BEGIN
 SELECT p.oid INTO STRICT function_oid FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='approve_private_booking';
 definition:=pg_get_functiondef(function_oid);
 IF (length(definition)-length(replace(definition,$old$AND start_time < p_selected_end_time + INTERVAL '60 minutes'$old$,'')))/length($old$AND start_time < p_selected_end_time + INTERVAL '60 minutes'$old$)<>1 THEN RAISE EXCEPTION 'Unexpected approve_private_booking definition: preparation guard'; END IF;
 definition:=replace(definition,$old$AND start_time < p_selected_end_time + INTERVAL '60 minutes'$old$,$new$AND date + start_time < v_calendar_date + p_selected_end_time + make_interval(mins => public.resolve_preparation_minutes(v_org_id,NULL,NULL,id))$new$);
 IF (length(definition)-length(replace(definition,$old$AND end_time > p_selected_start_time - INTERVAL '60 minutes'$old$,'')))/length($old$AND end_time > p_selected_start_time - INTERVAL '60 minutes'$old$)<>1 THEN RAISE EXCEPTION 'Unexpected approve_private_booking definition: preparation guard'; END IF;
 definition:=replace(definition,$old$AND end_time > p_selected_start_time - INTERVAL '60 minutes'$old$,$new$AND date + end_time > v_calendar_date + p_selected_start_time - make_interval(mins => public.resolve_preparation_minutes(v_org_id,p_selected_store_id,v_reservation.scenario_master_id,NULL))$new$);
 EXECUTE definition;
END $migration$;
DO $migration$
DECLARE definition text; function_oid oid;
BEGIN
 SELECT p.oid INTO STRICT function_oid FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='create_private_booking_request';
 definition:=pg_get_functiondef(function_oid);
 IF (length(definition)-length(replace(definition,$old$AND event.start_time < v_cand_end + INTERVAL '60 minutes'$old$,'')))/length($old$AND event.start_time < v_cand_end + INTERVAL '60 minutes'$old$)<>1 THEN RAISE EXCEPTION 'Unexpected create_private_booking_request definition: preparation guard'; END IF;
 definition:=replace(definition,$old$AND event.start_time < v_cand_end + INTERVAL '60 minutes'$old$,$new$AND event.date + event.start_time < v_cand_date + v_cand_end + make_interval(mins => public.resolve_preparation_minutes(v_org_id,NULL,NULL,event.id))$new$);
 IF (length(definition)-length(replace(definition,$old$AND event.end_time > v_cand_start - INTERVAL '60 minutes'$old$,'')))/length($old$AND event.end_time > v_cand_start - INTERVAL '60 minutes'$old$)<>1 THEN RAISE EXCEPTION 'Unexpected create_private_booking_request definition: preparation guard'; END IF;
 definition:=replace(definition,$old$AND event.end_time > v_cand_start - INTERVAL '60 minutes'$old$,$new$AND event.date + event.end_time > v_cand_date + v_cand_start - make_interval(mins => public.resolve_preparation_minutes(v_org_id,v_store_uuid,COALESCE(v_scenario_master_id,p_scenario_id),NULL))$new$);
 EXECUTE definition;
END $migration$;

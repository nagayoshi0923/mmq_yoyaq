CREATE OR REPLACE FUNCTION public.get_performance_judgment_deadline(p_organization_id uuid,p_event_id uuid)
RETURNS timestamptz LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE e record; fixed_deadline timestamptz;
BEGIN
 SELECT organization_id,date,start_time INTO e FROM schedule_events WHERE id=p_event_id AND organization_id=p_organization_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'event not found' USING ERRCODE='42501'; END IF;
 SELECT deadline_at INTO fixed_deadline FROM performance_judgment_deadlines WHERE schedule_event_id=p_event_id AND organization_id=p_organization_id;
 RETURN COALESCE(fixed_deadline,((e.date+e.start_time) AT TIME ZONE 'Asia/Tokyo') - make_interval(mins=>(public.resolve_operating_setting(p_organization_id,'judgment_minutes_before','240'::jsonb,NULL,NULL,p_event_id)->>'value')::integer));
END $$;
REVOKE ALL ON FUNCTION public.get_performance_judgment_deadline(uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.get_performance_judgment_deadline(uuid,uuid) TO service_role;

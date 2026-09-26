-- 公開の空き判定に必要な分数だけを返す。予約・顧客・メール設定は返さない。
CREATE OR REPLACE FUNCTION public.get_public_preparation_context(p_organization_id uuid,p_scenario_lookup_id uuid,p_start_date date,p_end_date date)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE store_values jsonb; event_values jsonb;
BEGIN
 IF p_start_date IS NULL OR p_end_date IS NULL OR p_end_date<p_start_date OR p_end_date-p_start_date>180 THEN
   RAISE EXCEPTION 'INVALID_AVAILABILITY_RANGE' USING ERRCODE='P0041';
 END IF;
 IF NOT EXISTS(SELECT 1 FROM organizations WHERE id=p_organization_id AND is_active) THEN
   RAISE EXCEPTION 'organization not found' USING ERRCODE='42501';
 END IF;
 IF NOT EXISTS(SELECT 1 FROM organization_scenarios WHERE organization_id=p_organization_id
    AND (id=p_scenario_lookup_id OR scenario_master_id=p_scenario_lookup_id)) THEN
   RAISE EXCEPTION 'scenario not found' USING ERRCODE='42501';
 END IF;
 SELECT COALESCE(jsonb_object_agg(s.id,public.resolve_preparation_minutes(p_organization_id,s.id,p_scenario_lookup_id,NULL)),'{}'::jsonb)
 INTO store_values FROM stores s WHERE s.organization_id=p_organization_id AND s.status='active';
 SELECT COALESCE(jsonb_object_agg(e.id,public.resolve_preparation_minutes(p_organization_id,NULL,NULL,e.id)),'{}'::jsonb)
 INTO event_values FROM schedule_events e JOIN stores s ON s.id=e.store_id AND s.organization_id=e.organization_id
 WHERE e.organization_id=p_organization_id AND NOT e.is_cancelled AND s.status='active' AND e.date BETWEEN p_start_date - 2 AND p_end_date + 2;
 RETURN jsonb_build_object('stores',store_values,'events',event_values);
END $$;
REVOKE ALL ON FUNCTION public.get_public_preparation_context(uuid,uuid,date,date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_preparation_context(uuid,uuid,date,date) TO anon,authenticated,service_role;

-- 予約画面に必要な作品の時間・公開受付期間だけを返す。テーブル直接権限は追加しない。
CREATE OR REPLACE FUNCTION public.get_public_private_booking_scenario_timing(p_organization_id uuid,p_scenario_lookup_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE result jsonb;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.organizations WHERE id=p_organization_id AND is_active AND booking_site_status='approved') THEN
  RAISE EXCEPTION 'organization not found' USING ERRCODE='42501';
 END IF;
 SELECT jsonb_build_object('title',v.title,'duration',v.duration,'weekend_duration',v.weekend_duration,
  'extra_preparation_time',v.extra_preparation_time,'private_booking_time_slots',v.private_booking_time_slots,
  'private_booking_time_slots_weekend',v.private_booking_time_slots_weekend,'private_booking_slot_start_times',v.private_booking_slot_start_times,
  'available_from',v.available_from,'available_until',v.available_until)
 INTO result FROM public.organization_scenarios_with_master v
 WHERE v.organization_id=p_organization_id AND (v.org_scenario_id=p_scenario_lookup_id OR v.scenario_master_id=p_scenario_lookup_id)
 AND v.org_status='available' AND v.master_status='approved'
 ORDER BY CASE WHEN v.org_scenario_id=p_scenario_lookup_id THEN 0 ELSE 1 END LIMIT 1;
 IF result IS NULL THEN RAISE EXCEPTION 'scenario not found' USING ERRCODE='42501'; END IF;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.get_public_private_booking_scenario_timing(uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_private_booking_scenario_timing(uuid,uuid) TO anon,authenticated,service_role;

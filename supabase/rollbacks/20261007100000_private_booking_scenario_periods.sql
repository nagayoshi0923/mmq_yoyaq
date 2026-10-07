-- 20261007100000_private_booking_scenario_periods の戻し: 候補日チェックを締切だけに戻し、公演期間2列の未ログイン閲覧を外す。
CREATE OR REPLACE FUNCTION public.assert_private_booking_candidate_date(p_org UUID,p_scenario UUID,p_date DATE)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE days INTEGER;
BEGIN
 IF p_org IS NULL OR p_scenario IS NULL OR p_date IS NULL THEN RAISE EXCEPTION 'PRIVATE_BOOKING_CONTEXT_REQUIRED' USING ERRCODE='P0045'; END IF;
 days := public.get_effective_private_booking_deadline_days(p_org,NULL,p_scenario);
 IF p_date < (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Tokyo')::DATE + days THEN
   RAISE EXCEPTION 'PRIVATE_BOOKING_DEADLINE_PASSED' USING ERRCODE='P0045';
 END IF;
END;
$$;

REVOKE SELECT (available_from, available_until) ON public.organization_scenarios_with_master FROM anon;

-- 20260930050000 を戻す: 受付不可枠だけを返す定義へ戻す。
CREATE OR REPLACE FUNCTION public.get_public_private_booking_availability(p_organization_id uuid, p_store_ids uuid[], p_start_date date, p_end_date date)
 RETURNS TABLE(date date, store_id uuid, time_slot text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF p_organization_id IS NULL
     OR p_start_date IS NULL
     OR p_end_date IS NULL
     OR p_start_date > p_end_date
     OR p_end_date - p_start_date > 180
  THEN
    RAISE EXCEPTION 'INVALID_AVAILABILITY_RANGE' USING ERRCODE = 'P0041';
  END IF;

  IF COALESCE(array_length(p_store_ids, 1), 0) = 0 THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    blocked.date,
    store.id,
    blocked.time_slot
  FROM public.schedule_blocked_slots blocked
  JOIN public.organizations organization
    ON organization.id = blocked.organization_id
   AND organization.is_active = TRUE
  JOIN public.stores store
    ON store.id::TEXT = blocked.store_id
   AND store.organization_id = blocked.organization_id
  WHERE blocked.organization_id = p_organization_id
    AND store.id = ANY(p_store_ids)
    AND store.status = 'active'
    AND blocked.date BETWEEN p_start_date AND p_end_date
    AND blocked.time_slot IN ('morning', 'afternoon', 'evening')
  ORDER BY blocked.date, store.id, blocked.time_slot;
END;
$function$;
NOTIFY pgrst, 'reload schema';

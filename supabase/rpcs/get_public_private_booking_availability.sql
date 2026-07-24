-- 正規ソース: get_public_private_booking_availability
-- 公開貸切画面へ、指定組織・店舗・期間の募集停止状態だけを返す（PIIを返さない）。

CREATE OR REPLACE FUNCTION public.get_public_private_booking_availability(
  p_organization_id UUID,
  p_store_ids UUID[],
  p_start_date DATE,
  p_end_date DATE
)
RETURNS TABLE (
  date DATE,
  store_id UUID,
  time_slot TEXT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
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
$$;

REVOKE ALL ON FUNCTION public.get_public_private_booking_availability(UUID, UUID[], DATE, DATE) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_private_booking_availability(UUID, UUID[], DATE, DATE)
  TO anon, authenticated, service_role;

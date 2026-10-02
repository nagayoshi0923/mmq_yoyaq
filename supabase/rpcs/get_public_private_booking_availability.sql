-- 正規ソース: get_public_private_booking_availability
-- 公開貸切画面へ、指定組織・店舗・期間の募集停止状態だけを返す（PIIを返さない）。
-- 受付不可枠（schedule_blocked_slots）と、店舗の貸切募集停止期間（store_recruitment_pauses）の両方を返す。

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
  UNION
  -- 店舗の貸切募集停止期間（QW-20260909-011）: 期間内の日は朝・昼・夜すべて停止として返す
  SELECT
    day::DATE,
    store.id,
    slot.time_slot
  FROM public.store_recruitment_pauses pause
  JOIN public.organizations organization
    ON organization.id = pause.organization_id
   AND organization.is_active = TRUE
  JOIN public.stores store
    ON store.id = pause.store_id
   AND store.organization_id = pause.organization_id
  CROSS JOIN LATERAL generate_series(
    GREATEST(p_start_date, COALESCE(pause.starts_on, p_start_date)),
    LEAST(p_end_date, COALESCE(pause.ends_on, p_end_date)),
    INTERVAL '1 day'
  ) AS day
  CROSS JOIN (VALUES ('morning'), ('afternoon'), ('evening')) AS slot(time_slot)
  WHERE pause.organization_id = p_organization_id
    AND pause.pause_type = 'private'
    AND store.id = ANY(p_store_ids)
    AND store.status = 'active'
  ORDER BY 1, 2, 3;
END;
$$;

REVOKE ALL ON FUNCTION public.get_public_private_booking_availability(UUID, UUID[], DATE, DATE) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_private_booking_availability(UUID, UUID[], DATE, DATE)
  TO anon, authenticated, service_role;

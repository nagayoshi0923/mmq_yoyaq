-- approve_private_booking: cancelled ステータスも承認可能にする（却下後の再承認対応）

DROP FUNCTION IF EXISTS public.approve_private_booking(UUID, DATE, TIME, TIME, UUID, UUID, JSONB, TEXT, TEXT, UUID);

CREATE OR REPLACE FUNCTION approve_private_booking(
  p_reservation_id UUID,
  p_selected_date DATE,
  p_selected_start_time TIME,
  p_selected_end_time TIME,
  p_selected_store_id UUID,
  p_selected_gm_id UUID,
  p_candidate_datetimes JSONB,
  p_scenario_title TEXT,
  p_customer_name TEXT,
  p_selected_sub_gm_id UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
DECLARE
  v_reservation RECORD;
  v_org_id UUID;
  v_caller_org_id UUID;
  v_caller_staff_id UUID;
  v_schedule_event_id UUID;
  v_existing_event_id UUID;
  v_gm_name TEXT;
  v_sub_gm_name TEXT;
  v_store_name TEXT;
  v_updated_count INTEGER;
  v_private_group_id UUID;
  v_gms_array TEXT[];
  v_gm_roles JSONB;
  v_calendar_date DATE;
  v_raw TEXT;
BEGIN
  SELECT *
  INTO v_reservation
  FROM reservations
  WHERE id = p_reservation_id
    AND status IN ('pending', 'pending_gm', 'gm_confirmed', 'pending_store', 'confirmed', 'cancelled')
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'RESERVATION_NOT_FOUND_OR_ALREADY_CONFIRMED' USING ERRCODE = 'P0018';
  END IF;

  v_org_id := v_reservation.organization_id;
  v_private_group_id := v_reservation.private_group_id;
  v_existing_event_id := v_reservation.schedule_event_id;

  v_caller_org_id := get_user_organization_id();
  IF NOT (is_org_admin() OR (v_caller_org_id IS NOT NULL AND v_caller_org_id = v_org_id)) THEN
    RAISE EXCEPTION 'UNAUTHORIZED' USING ERRCODE = 'P0010';
  END IF;

  SELECT id INTO v_caller_staff_id
  FROM staff
  WHERE user_id = auth.uid()
    AND organization_id = v_org_id;

  SELECT name INTO v_gm_name
  FROM staff
  WHERE id = p_selected_gm_id
    AND organization_id = v_org_id;

  IF v_gm_name IS NULL THEN
    RAISE EXCEPTION 'GM_NOT_FOUND' USING ERRCODE = 'P0022';
  END IF;

  v_sub_gm_name := NULL;
  IF p_selected_sub_gm_id IS NOT NULL THEN
    IF p_selected_sub_gm_id = p_selected_gm_id THEN
      RAISE EXCEPTION 'SUB_GM_SAME_AS_MAIN' USING ERRCODE = 'P0026';
    END IF;
    SELECT name INTO v_sub_gm_name
    FROM staff
    WHERE id = p_selected_sub_gm_id
      AND organization_id = v_org_id;
    IF v_sub_gm_name IS NULL THEN
      RAISE EXCEPTION 'SUB_GM_NOT_FOUND' USING ERRCODE = 'P0022';
    END IF;
  END IF;

  SELECT name INTO v_store_name
  FROM stores
  WHERE id = p_selected_store_id
    AND organization_id = v_org_id;

  IF v_store_name IS NULL THEN
    RAISE EXCEPTION 'STORE_NOT_FOUND' USING ERRCODE = 'P0023';
  END IF;

  v_calendar_date := p_selected_date;
  SELECT elem->>'date' INTO v_raw
  FROM jsonb_array_elements(COALESCE(p_candidate_datetimes->'candidates', '[]'::jsonb)) AS elem
  WHERE elem->>'status' = 'confirmed'
  LIMIT 1;

  IF v_raw IS NOT NULL AND btrim(v_raw) <> '' THEN
    IF btrim(v_raw) ~ '^\d{4}-\d{2}-\d{2}$' THEN
      v_calendar_date := btrim(v_raw)::date;
    ELSE
      BEGIN
        v_calendar_date := ((btrim(v_raw))::timestamptz AT TIME ZONE 'Asia/Tokyo')::date;
      EXCEPTION WHEN OTHERS THEN
        v_calendar_date := p_selected_date;
      END;
    END IF;
  END IF;

  IF v_existing_event_id IS NOT NULL THEN
    UPDATE schedule_events
    SET is_cancelled = true,
        updated_at = NOW()
    WHERE id = v_existing_event_id;
  END IF;

  PERFORM 1
  FROM schedule_events
  WHERE organization_id = v_org_id
    AND date = v_calendar_date
    AND is_cancelled = false
    AND v_gm_name = ANY(gms)
    AND start_time < p_selected_end_time
    AND end_time > p_selected_start_time
    AND id != COALESCE(v_existing_event_id, '00000000-0000-0000-0000-000000000000'::uuid)
  FOR UPDATE NOWAIT;

  IF FOUND THEN
    RAISE EXCEPTION 'GM_ALREADY_ASSIGNED' USING ERRCODE = 'P0025';
  END IF;

  IF v_sub_gm_name IS NOT NULL THEN
    PERFORM 1
    FROM schedule_events
    WHERE organization_id = v_org_id
      AND date = v_calendar_date
      AND is_cancelled = false
      AND v_sub_gm_name = ANY(gms)
      AND start_time < p_selected_end_time
      AND end_time > p_selected_start_time
      AND id != COALESCE(v_existing_event_id, '00000000-0000-0000-0000-000000000000'::uuid)
    FOR UPDATE NOWAIT;

    IF FOUND THEN
      RAISE EXCEPTION 'GM_ALREADY_ASSIGNED' USING ERRCODE = 'P0025';
    END IF;
  END IF;

  PERFORM 1
  FROM schedule_events
  WHERE organization_id = v_org_id
    AND date = v_calendar_date
    AND store_id = p_selected_store_id
    AND is_cancelled = false
    AND start_time < p_selected_end_time
    AND end_time > p_selected_start_time
    AND id != COALESCE(v_existing_event_id, '00000000-0000-0000-0000-000000000000'::uuid)
  FOR UPDATE NOWAIT;

  IF FOUND THEN
    RAISE EXCEPTION 'SLOT_ALREADY_OCCUPIED' USING ERRCODE = 'P0019';
  END IF;

  IF v_sub_gm_name IS NOT NULL THEN
    v_gms_array := ARRAY[v_gm_name, v_sub_gm_name];
    v_gm_roles := jsonb_build_object(v_gm_name, 'main', v_sub_gm_name, 'sub');
  ELSE
    v_gms_array := ARRAY[v_gm_name];
    v_gm_roles := '{}'::jsonb;
  END IF;

  INSERT INTO schedule_events (
    date,
    venue,
    scenario,
    start_time,
    end_time,
    start_at,
    end_at,
    store_id,
    gms,
    gm_roles,
    is_reservation_enabled,
    status,
    category,
    organization_id,
    reservation_id,
    reservation_name,
    is_reservation_name_overwritten
  ) VALUES (
    v_calendar_date,
    v_store_name,
    p_scenario_title,
    p_selected_start_time,
    p_selected_end_time,
    (v_calendar_date + p_selected_start_time)::timestamptz,
    (v_calendar_date + p_selected_end_time)::timestamptz,
    p_selected_store_id,
    v_gms_array,
    v_gm_roles,
    false,
    'confirmed',
    'private',
    v_org_id,
    p_reservation_id,
    p_customer_name,
    false
  )
  RETURNING id INTO v_schedule_event_id;

  UPDATE reservations
  SET
    status = 'confirmed',
    gm_staff = p_selected_gm_id,
    store_id = p_selected_store_id,
    schedule_event_id = v_schedule_event_id,
    candidate_datetimes = COALESCE(p_candidate_datetimes, candidate_datetimes),
    requested_datetime = (v_calendar_date::text || ' ' || p_selected_start_time::text)::TIMESTAMP WITH TIME ZONE,
    duration = EXTRACT(EPOCH FROM (p_selected_end_time - p_selected_start_time)) / 60,
    confirmed_by = COALESCE(v_caller_staff_id, confirmed_by),
    updated_at = NOW()
  WHERE id = p_reservation_id;

  GET DIAGNOSTICS v_updated_count = ROW_COUNT;
  IF v_updated_count <> 1 THEN
    RAISE EXCEPTION 'RESERVATION_UPDATE_FAILED' USING ERRCODE = 'P0024';
  END IF;

  IF v_private_group_id IS NOT NULL THEN
    UPDATE private_groups
    SET status = 'confirmed'
    WHERE id = v_private_group_id;
  END IF;

  RETURN v_schedule_event_id;
END;
$$;

GRANT EXECUTE ON FUNCTION approve_private_booking(
  UUID, DATE, TIME, TIME, UUID, UUID, JSONB, TEXT, TEXT, UUID
) TO authenticated;

COMMENT ON FUNCTION approve_private_booking(
  UUID, DATE, TIME, TIME, UUID, UUID, JSONB, TEXT, TEXT, UUID
) IS
'貸切予約承認。却下後の再承認にも対応。確定候補の date を JST 暦で解釈して schedule_events.date に保存。';

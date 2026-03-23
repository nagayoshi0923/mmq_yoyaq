-- 貸切承認で2人GM（メイン＋サブ）を同時に schedule_events に登録する
-- p_selected_sub_gm_id が NULL のときは従来どおり1名のみ

DROP FUNCTION IF EXISTS public.approve_private_booking(UUID, DATE, TIME, TIME, UUID, UUID, JSONB, TEXT, TEXT);

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
BEGIN
  SELECT *
  INTO v_reservation
  FROM reservations
  WHERE id = p_reservation_id
    AND status IN ('pending', 'gm_confirmed', 'confirmed')
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

  IF v_existing_event_id IS NOT NULL THEN
    UPDATE schedule_events
    SET is_cancelled = true,
        updated_at = NOW()
    WHERE id = v_existing_event_id;
  END IF;

  -- メインGMの重複
  PERFORM 1
  FROM schedule_events
  WHERE organization_id = v_org_id
    AND date = p_selected_date
    AND is_cancelled = false
    AND v_gm_name = ANY(gms)
    AND start_time < p_selected_end_time
    AND end_time > p_selected_start_time
    AND id != COALESCE(v_existing_event_id, '00000000-0000-0000-0000-000000000000'::uuid)
  FOR UPDATE NOWAIT;

  IF FOUND THEN
    RAISE EXCEPTION 'GM_ALREADY_ASSIGNED' USING ERRCODE = 'P0025';
  END IF;

  -- サブGMの重複
  IF v_sub_gm_name IS NOT NULL THEN
    PERFORM 1
    FROM schedule_events
    WHERE organization_id = v_org_id
      AND date = p_selected_date
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
    AND date = p_selected_date
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
    p_selected_date,
    v_store_name,
    p_scenario_title,
    p_selected_start_time,
    p_selected_end_time,
    (p_selected_date + p_selected_start_time)::timestamptz,
    (p_selected_date + p_selected_end_time)::timestamptz,
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
    requested_datetime = (p_selected_date || ' ' || p_selected_start_time)::TIMESTAMP WITH TIME ZONE,
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
'貸切予約承認。p_selected_sub_gm_id 指定時は gms に2名、gm_roles に main/sub を設定。';

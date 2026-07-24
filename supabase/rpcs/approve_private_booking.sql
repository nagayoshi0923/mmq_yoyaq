-- 正規ソース: approve_private_booking
-- 2026-07-23 本番 pg_get_functiondef から復元し、募集停止・tenant・候補整合を追加。

CREATE OR REPLACE FUNCTION public.approve_private_booking(
  p_reservation_id UUID,
  p_selected_date DATE,
  p_selected_start_time TIME WITHOUT TIME ZONE,
  p_selected_end_time TIME WITHOUT TIME ZONE,
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
  v_store_short_name TEXT;
  v_updated_count INTEGER;
  v_private_group_id UUID;
  v_gms_array TEXT[];
  v_gm_roles JSONB;
  v_calendar_date DATE;
  v_raw TEXT;
  v_candidate JSONB;
  v_candidate_date DATE;
  v_candidate_start_time TIME;
  v_candidate_end_time TIME;
  v_candidate_time_slot TEXT;
  v_schedule_time_slot TEXT;
  v_trusted_candidate_found BOOLEAN := false;
  v_requested_store_count INTEGER;
  v_candidate_ordinal BIGINT;
  v_selected_candidate_ordinal BIGINT;
  v_normalized_candidate JSONB;
  v_rebuilt_candidates JSONB := '[]'::JSONB;
  v_confirmed_candidate_datetimes JSONB;
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
  IF auth.uid() IS NULL
     OR v_caller_org_id IS NULL
     OR v_caller_org_id IS DISTINCT FROM v_org_id
  THEN
    RAISE EXCEPTION 'UNAUTHORIZED' USING ERRCODE = 'P0010';
  END IF;

  SELECT id INTO v_caller_staff_id
  FROM staff
  WHERE user_id = auth.uid()
    AND organization_id = v_org_id
  ORDER BY id
  LIMIT 1;

  IF NOT is_staff_or_admin()
     OR (v_caller_staff_id IS NULL AND NOT is_org_admin())
  THEN
    RAISE EXCEPTION 'UNAUTHORIZED' USING ERRCODE = 'P0010';
  END IF;

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

  SELECT name, short_name
  INTO v_store_name, v_store_short_name
  FROM stores
  WHERE id = p_selected_store_id
    AND organization_id = v_org_id
    AND status = 'active';

  IF v_store_name IS NULL THEN
    RAISE EXCEPTION 'STORE_NOT_FOUND' USING ERRCODE = 'P0023';
  END IF;

  -- 希望店舗が保存されている申請では、その信頼済み集合からだけ承認する。
  v_requested_store_count := jsonb_array_length(
    COALESCE(v_reservation.candidate_datetimes->'requestedStores', '[]'::jsonb)
  );
  IF v_requested_store_count > 0 AND NOT EXISTS (
    SELECT 1
    FROM jsonb_array_elements(v_reservation.candidate_datetimes->'requestedStores') requested
    WHERE requested->>'storeId' = p_selected_store_id::TEXT
  ) THEN
    RAISE EXCEPTION 'STORE_NOT_REQUESTED' USING ERRCODE = 'P0042';
  END IF;

  -- clientが送ったconfirmed状態ではなく、予約に保存済みの候補から日付・開始・time_slotを復元する。
  FOR v_candidate, v_candidate_ordinal IN
    SELECT candidate.value, candidate.ordinality
    FROM jsonb_array_elements(
      COALESCE(v_reservation.candidate_datetimes->'candidates', '[]'::jsonb)
    ) WITH ORDINALITY AS candidate(value, ordinality)
  LOOP
    v_raw := v_candidate->>'date';
    BEGIN
      IF btrim(v_raw) ~ '^\d{4}-\d{2}-\d{2}$' THEN
        v_candidate_date := btrim(v_raw)::DATE;
      ELSE
        v_candidate_date := ((btrim(v_raw))::TIMESTAMPTZ AT TIME ZONE 'Asia/Tokyo')::DATE;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      CONTINUE;
    END;

    BEGIN
      v_candidate_start_time := (v_candidate->>'startTime')::TIME;
      v_candidate_end_time := (v_candidate->>'endTime')::TIME;
    EXCEPTION WHEN OTHERS THEN
      CONTINUE;
    END;

    IF v_candidate_date = p_selected_date
       AND v_candidate_start_time = p_selected_start_time
       AND v_candidate_end_time = p_selected_end_time
    THEN
      v_candidate_time_slot := CASE v_candidate->>'timeSlot'
        WHEN 'morning' THEN 'morning'
        WHEN '朝' THEN 'morning'
        WHEN '午前' THEN 'morning'
        WHEN 'afternoon' THEN 'afternoon'
        WHEN '昼' THEN 'afternoon'
        WHEN '午後' THEN 'afternoon'
        WHEN 'evening' THEN 'evening'
        WHEN '夜' THEN 'evening'
        WHEN '夜間' THEN 'evening'
        ELSE NULL
      END;
      v_selected_candidate_ordinal := v_candidate_ordinal;
      v_trusted_candidate_found := true;
      EXIT;
    END IF;
  END LOOP;

  IF NOT v_trusted_candidate_found OR v_candidate_time_slot IS NULL THEN
    RAISE EXCEPTION 'INVALID_SELECTED_CANDIDATE' USING ERRCODE = 'P0041';
  END IF;
  IF p_selected_start_time >= p_selected_end_time THEN
    RAISE EXCEPTION 'INVALID_SELECTED_CANDIDATE_TIME' USING ERRCODE = 'P0041';
  END IF;

  -- live client互換のshapeを維持しつつ、保存済み候補だけからconfirmed状態を再構築する。
  FOR v_candidate, v_candidate_ordinal IN
    SELECT candidate.value, candidate.ordinality
    FROM jsonb_array_elements(
      COALESCE(v_reservation.candidate_datetimes->'candidates', '[]'::jsonb)
    ) WITH ORDINALITY AS candidate(value, ordinality)
  LOOP
    v_normalized_candidate := v_candidate;
    v_raw := v_candidate->>'date';
    IF v_raw IS NOT NULL THEN
      BEGIN
        IF btrim(v_raw) ~ '^\d{4}-\d{2}-\d{2}$' THEN
          v_candidate_date := btrim(v_raw)::DATE;
        ELSE
          v_candidate_date := ((btrim(v_raw))::TIMESTAMPTZ AT TIME ZONE 'Asia/Tokyo')::DATE;
        END IF;
        v_normalized_candidate := jsonb_set(
          v_normalized_candidate,
          '{date}',
          to_jsonb(v_candidate_date::TEXT),
          true
        );
      EXCEPTION WHEN OTHERS THEN
        NULL;
      END;
    END IF;

    v_normalized_candidate := jsonb_set(
      v_normalized_candidate,
      '{status}',
      to_jsonb(
        CASE
          WHEN v_candidate_ordinal = v_selected_candidate_ordinal THEN 'confirmed'
          ELSE 'pending'
        END
      ),
      true
    );
    v_rebuilt_candidates := v_rebuilt_candidates || jsonb_build_array(v_normalized_candidate);
  END LOOP;

  v_confirmed_candidate_datetimes := jsonb_set(
    jsonb_set(
      COALESCE(v_reservation.candidate_datetimes, '{}'::JSONB),
      '{candidates}',
      v_rebuilt_candidates,
      true
    ),
    '{confirmedStore}',
    jsonb_build_object(
      'storeId', p_selected_store_id::TEXT,
      'storeName', v_store_name,
      'storeShortName', COALESCE(v_store_short_name, v_store_name)
    ),
    true
  );

  v_calendar_date := p_selected_date;
  v_schedule_time_slot := CASE v_candidate_time_slot
    WHEN 'morning' THEN '朝'
    WHEN 'afternoon' THEN '昼'
    ELSE '夜'
  END;

  -- block/unblockと全公演INSERTを直列化し、検査からINSERTまで同じ状態を維持する。
  LOCK TABLE schedule_blocked_slots IN SHARE MODE;
  LOCK TABLE schedule_events IN SHARE ROW EXCLUSIVE MODE;

  IF EXISTS (
    SELECT 1
    FROM schedule_blocked_slots blocked
    WHERE blocked.organization_id = v_org_id
      AND blocked.store_id = p_selected_store_id::TEXT
      AND blocked.date = v_calendar_date
      AND blocked.time_slot = v_candidate_time_slot
  ) THEN
    RAISE EXCEPTION 'PRIVATE_BOOKING_SLOT_BLOCKED:%:%', v_calendar_date, v_candidate_time_slot
      USING ERRCODE = 'P0040';
  END IF;

  IF v_existing_event_id IS NOT NULL THEN
    UPDATE schedule_events
    SET is_cancelled = true,
        updated_at = NOW()
    WHERE id = v_existing_event_id
      AND organization_id = v_org_id;
  END IF;

  -- メインGMの競合チェック（直接重複）
  PERFORM 1
  FROM schedule_events
  WHERE organization_id = v_org_id
    AND date = v_calendar_date
    AND is_cancelled = false
    AND v_gm_name = ANY(gms)
    AND start_time < p_selected_end_time
    AND end_time > p_selected_start_time
    AND id != COALESCE(v_existing_event_id, '00000000-0000-0000-0000-000000000000'::UUID)
  FOR UPDATE NOWAIT;

  IF FOUND THEN
    RAISE EXCEPTION 'GM_ALREADY_ASSIGNED' USING ERRCODE = 'P0025';
  END IF;

  -- サブGMの競合チェック（直接重複）
  IF v_sub_gm_name IS NOT NULL THEN
    PERFORM 1
    FROM schedule_events
    WHERE organization_id = v_org_id
      AND date = v_calendar_date
      AND is_cancelled = false
      AND v_sub_gm_name = ANY(gms)
      AND start_time < p_selected_end_time
      AND end_time > p_selected_start_time
      AND id != COALESCE(v_existing_event_id, '00000000-0000-0000-0000-000000000000'::UUID)
    FOR UPDATE NOWAIT;

    IF FOUND THEN
      RAISE EXCEPTION 'GM_ALREADY_ASSIGNED' USING ERRCODE = 'P0025';
    END IF;
  END IF;

  -- 店舗の直接重複チェック
  PERFORM 1
  FROM schedule_events
  WHERE organization_id = v_org_id
    AND date = v_calendar_date
    AND store_id = p_selected_store_id
    AND is_cancelled = false
    AND start_time < p_selected_end_time
    AND end_time > p_selected_start_time
    AND id != COALESCE(v_existing_event_id, '00000000-0000-0000-0000-000000000000'::UUID)
  FOR UPDATE NOWAIT;

  IF FOUND THEN
    RAISE EXCEPTION 'SLOT_ALREADY_OCCUPIED' USING ERRCODE = 'P0019';
  END IF;

  -- 店舗の60分インターバルチェック（設営・撤収時間の確保）
  PERFORM 1
  FROM schedule_events
  WHERE organization_id = v_org_id
    AND date = v_calendar_date
    AND store_id = p_selected_store_id
    AND is_cancelled = false
    AND start_time < p_selected_end_time + INTERVAL '60 minutes'
    AND end_time > p_selected_start_time - INTERVAL '60 minutes'
    AND id != COALESCE(v_existing_event_id, '00000000-0000-0000-0000-000000000000'::UUID)
  FOR UPDATE NOWAIT;

  IF FOUND THEN
    RAISE EXCEPTION 'INTERVAL_TOO_SHORT' USING ERRCODE = 'P0027';
  END IF;

  IF v_sub_gm_name IS NOT NULL THEN
    v_gms_array := ARRAY[v_gm_name, v_sub_gm_name];
    v_gm_roles := jsonb_build_object(v_gm_name, 'main', v_sub_gm_name, 'sub');
  ELSE
    v_gms_array := ARRAY[v_gm_name];
    v_gm_roles := '{}'::JSONB;
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
    is_reservation_name_overwritten,
    time_slot
  ) VALUES (
    v_calendar_date,
    v_store_name,
    p_scenario_title,
    p_selected_start_time,
    p_selected_end_time,
    (v_calendar_date + p_selected_start_time)::TIMESTAMPTZ,
    (v_calendar_date + p_selected_end_time)::TIMESTAMPTZ,
    p_selected_store_id,
    v_gms_array,
    v_gm_roles,
    false,
    'confirmed',
    'private',
    v_org_id,
    p_reservation_id,
    p_customer_name,
    false,
    v_schedule_time_slot
  )
  RETURNING id INTO v_schedule_event_id;

  UPDATE reservations
  SET
    status = 'confirmed',
    gm_staff = p_selected_gm_id,
    store_id = p_selected_store_id,
    schedule_event_id = v_schedule_event_id,
    candidate_datetimes = v_confirmed_candidate_datetimes,
    requested_datetime = (v_calendar_date::TEXT || ' ' || p_selected_start_time::TEXT)::TIMESTAMP WITH TIME ZONE,
    duration = EXTRACT(EPOCH FROM (p_selected_end_time - p_selected_start_time)) / 60,
    confirmed_by = COALESCE(v_caller_staff_id, confirmed_by),
    updated_at = NOW()
  WHERE id = p_reservation_id
    AND organization_id = v_org_id;

  GET DIAGNOSTICS v_updated_count = ROW_COUNT;
  IF v_updated_count <> 1 THEN
    RAISE EXCEPTION 'RESERVATION_UPDATE_FAILED' USING ERRCODE = 'P0024';
  END IF;

  IF v_private_group_id IS NOT NULL THEN
    UPDATE private_groups
    SET status = 'confirmed'
    WHERE id = v_private_group_id
      AND organization_id = v_org_id;
  END IF;

  RETURN v_schedule_event_id;
END;
$$;

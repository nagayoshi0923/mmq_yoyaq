-- QW-20260914-003 / #469. New bookings only; existing reservations are untouched.
BEGIN;

-- QW-20260914-003 / #469: keep booking-day classification on the server.
-- Same fixed / Happy Monday / equinox rules as japaneseHolidays.ts.
CREATE OR REPLACE FUNCTION public.is_booking_calendar_holiday(p_date DATE)
RETURNS BOOLEAN LANGUAGE plpgsql IMMUTABLE SET search_path = public AS $$
DECLARE
  y INTEGER := EXTRACT(YEAR FROM p_date);
  dates DATE[];
  m INTEGER;
  n INTEGER;
  first_day DATE;
BEGIN
  IF p_date IS NULL THEN RETURN FALSE; END IF;
  dates := ARRAY[make_date(y,1,1),make_date(y,2,11),make_date(y,2,23),
    make_date(y,4,29),make_date(y,5,3),make_date(y,5,4),make_date(y,5,5),
    make_date(y,8,11),make_date(y,11,3),make_date(y,11,23),
    make_date(y,3,floor(20.8431+0.242194*(y-1980)-floor((y-1980)/4.0))::int),
    make_date(y,9,floor(23.2488+0.242194*(y-1980)-floor((y-1980)/4.0))::int)];
  FOREACH m IN ARRAY ARRAY[1,7,9,10] LOOP
    n := CASE WHEN m IN (1,10) THEN 2 ELSE 3 END;
    first_day := make_date(y,m,1);
    dates := array_append(dates, first_day + ((8-EXTRACT(DOW FROM first_day)::int)%7) + 7*(n-1));
  END LOOP;
  RETURN p_date = ANY(dates)
    OR (EXTRACT(DOW FROM p_date)=1 AND p_date-1 = ANY(dates))
    OR (p_date-1 = ANY(dates) AND p_date+1 = ANY(dates));
END;
$$;

CREATE OR REPLACE FUNCTION public.calculate_booking_participation_fee(
  p_base_fee INTEGER, p_costs JSONB, p_date DATE, p_start_time TIME,
  p_custom_holiday BOOLEAN DEFAULT FALSE,
  p_pricing_date DATE DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Tokyo')::DATE
) RETURNS INTEGER LANGUAGE plpgsql STABLE SET search_path = public AS $$
DECLARE
  slots TEXT[] := ARRAY[]::TEXT[];
  cost JSONB;
  holiday BOOLEAN := public.is_booking_calendar_holiday(p_date) OR COALESCE(p_custom_holiday,FALSE);
  fee INTEGER;
  pricing_date TEXT := p_pricing_date::TEXT;
BEGIN
  IF EXTRACT(DOW FROM p_date) IN (0,6) OR holiday THEN
    slots := array_append(slots,'weekend');
  END IF;
  IF holiday THEN slots := array_append(slots,'holiday'); END IF;
  IF p_start_time IS NOT NULL THEN
    slots := array_append(slots,CASE WHEN EXTRACT(HOUR FROM p_start_time)<12 THEN 'morning'
      WHEN EXTRACT(HOUR FROM p_start_time)<18 THEN 'afternoon' ELSE 'evening' END);
  END IF;
  slots := slots || ARRAY['normal','通常'];
  IF jsonb_typeof(p_costs)='array' THEN
    SELECT entry INTO cost
    FROM jsonb_array_elements(p_costs) WITH ORDINALITY AS c(entry,ordinal)
    WHERE COALESCE(entry->>'status','active') IN ('active','ready')
      AND (NULLIF(entry->>'startDate','') IS NULL OR entry->>'startDate' <= pricing_date)
      AND (NULLIF(entry->>'endDate','') IS NULL OR entry->>'endDate' >= pricing_date)
      AND entry->>'time_slot'=ANY(slots)
    ORDER BY array_position(slots,entry->>'time_slot'),ordinal LIMIT 1;
  END IF;
  IF cost IS NULL THEN fee := p_base_fee;
  ELSIF cost->>'type'='percentage' THEN
    fee := ROUND(p_base_fee*(1+COALESCE((cost->>'amount')::NUMERIC,0)/100))::INTEGER;
  ELSE fee := (cost->>'amount')::INTEGER;
  END IF;
  IF fee IS NULL THEN
    RAISE EXCEPTION 'SCENARIO_FEE_NOT_FOUND' USING ERRCODE='P0017';
  END IF;
  RETURN fee;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_reservation_with_lock_v2(p_schedule_event_id uuid, p_participant_count integer, p_customer_id uuid, p_customer_name text, p_customer_email text, p_customer_phone text, p_notes text DEFAULT NULL::text, p_how_found text DEFAULT NULL::text, p_reservation_number text DEFAULT NULL::text, p_customer_coupon_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_max_participants INTEGER;
  v_current_participants INTEGER;
  v_available_seats INTEGER;
  v_reservation_id UUID;

  v_event_org_id UUID;
  v_scenario_id UUID;
  v_org_scenario_id UUID;
  v_store_id UUID;
  v_date DATE;
  v_start_time TIME;
  v_duration INTEGER;
  v_title TEXT;

  v_customer_user_id UUID;
  v_customer_org_id UUID;
  v_caller_org_id UUID;
  v_is_admin BOOLEAN;
  v_is_staff BOOLEAN;

  v_participation_fee INTEGER;
  v_participation_costs JSONB;
  v_custom_holiday BOOLEAN;

  v_unit_price INTEGER;
  v_total_price INTEGER;
  v_discount_amount INTEGER := 0;
  v_final_price INTEGER;
  v_requested_datetime TIMESTAMP;
  v_reservation_number TEXT;

  v_coupon RECORD;
  v_campaign RECORD;
  v_coupon_usage_id UUID;
BEGIN
  IF p_participant_count <= 0 THEN
    RAISE EXCEPTION 'INVALID_PARTICIPANT_COUNT' USING ERRCODE = 'P0001';
  END IF;

  SELECT organization_id,
         scenario_id,
         organization_scenario_id,
         store_id,
         date,
         start_time,
         COALESCE(max_participants, capacity, 8)
  INTO v_event_org_id, v_scenario_id, v_org_scenario_id, v_store_id, v_date, v_start_time, v_max_participants
  FROM schedule_events
  WHERE id = p_schedule_event_id
    AND is_cancelled = false
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'EVENT_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  v_caller_org_id := get_user_organization_id();
  v_is_admin := is_org_admin();
  v_is_staff := EXISTS (
    SELECT 1 FROM staff
    WHERE user_id = auth.uid()
      AND organization_id = v_event_org_id
      AND status = 'active'
  );

  IF p_customer_id IS NULL THEN
    IF NOT (v_is_admin OR v_is_staff) THEN
      RAISE EXCEPTION 'FORBIDDEN_STAFF_ONLY' USING ERRCODE = 'P0013';
    END IF;
    IF v_caller_org_id IS NOT NULL AND v_caller_org_id != v_event_org_id THEN
      RAISE EXCEPTION 'FORBIDDEN_ORG' USING ERRCODE = 'P0010';
    END IF;
    v_customer_user_id := NULL;
    v_customer_org_id := v_event_org_id;
  ELSE
    SELECT user_id, organization_id
    INTO v_customer_user_id, v_customer_org_id
    FROM customers
    WHERE id = p_customer_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'CUSTOMER_NOT_FOUND' USING ERRCODE = 'P0009';
    END IF;

    IF v_is_admin THEN
      NULL;
    ELSIF v_is_staff THEN
      IF v_caller_org_id != v_event_org_id THEN
        RAISE EXCEPTION 'FORBIDDEN_ORG' USING ERRCODE = 'P0010';
      END IF;
    ELSE
      -- customer ロール: 自分自身の予約のみ許可（platform customer は org を問わない）
      IF v_customer_user_id IS DISTINCT FROM auth.uid() THEN
        RAISE EXCEPTION 'FORBIDDEN_CUSTOMER' USING ERRCODE = 'P0011';
      END IF;
    END IF;

    -- platform customer (organization_id = NULL) は全組織で予約可
    -- guest customer (organization_id IS NOT NULL) は自組織のみ
    IF v_customer_org_id IS NOT NULL AND v_customer_org_id IS DISTINCT FROM v_event_org_id THEN
      RAISE EXCEPTION 'CUSTOMER_ORG_MISMATCH' USING ERRCODE = 'P0012';
    END IF;
  END IF;

  SELECT COALESCE(SUM(participant_count), 0)
  INTO v_current_participants
  FROM reservations
  WHERE schedule_event_id = p_schedule_event_id
    AND status IN ('pending', 'confirmed', 'gm_confirmed', 'checked_in');

  v_available_seats := v_max_participants - v_current_participants;

  IF v_available_seats <= 0 THEN
    RAISE EXCEPTION 'SOLD_OUT' USING ERRCODE = 'P0003';
  END IF;

  IF p_participant_count > v_available_seats THEN
    RAISE EXCEPTION 'INSUFFICIENT_SEATS' USING ERRCODE = 'P0004';
  END IF;

  IF v_org_scenario_id IS NOT NULL THEN
    SELECT
      os.participation_fee,
      os.participation_costs,
      COALESCE(os.duration, sm.official_duration),
      COALESCE(os.override_title, sm.title)
    INTO v_participation_fee, v_participation_costs, v_duration, v_title
    FROM organization_scenarios os
    JOIN scenario_masters sm ON sm.id = os.scenario_master_id
    WHERE os.id = v_org_scenario_id;
  ELSIF v_scenario_id IS NOT NULL THEN
    SELECT participation_fee, participation_costs, duration, title
    INTO v_participation_fee, v_participation_costs, v_duration, v_title
    FROM scenarios_v2
    WHERE id = v_scenario_id;

    IF NOT FOUND THEN
      SELECT participation_fee, participation_costs, duration, title
      INTO v_participation_fee, v_participation_costs, v_duration, v_title
      FROM scenarios
      WHERE id = v_scenario_id;
    END IF;
  END IF;

  IF v_participation_fee IS NULL AND v_title IS NULL THEN
    RAISE EXCEPTION 'SCENARIO_NOT_FOUND' USING ERRCODE = 'P0017';
  END IF;

  SELECT COALESCE(bool_or(COALESCE(os.custom_holidays, '[]'::JSONB) ? v_date::TEXT), FALSE)
  INTO v_custom_holiday
  FROM organization_settings os
  WHERE os.organization_id = v_event_org_id;

  v_unit_price := public.calculate_booking_participation_fee(
    v_participation_fee, v_participation_costs, v_date, v_start_time, v_custom_holiday
  );

  v_total_price := v_unit_price * p_participant_count;

  IF p_customer_coupon_id IS NOT NULL THEN
    SELECT cc.*
    INTO v_coupon
    FROM customer_coupons cc
    WHERE cc.id = p_customer_coupon_id
      AND cc.customer_id = p_customer_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'COUPON_NOT_FOUND: 指定されたクーポンが見つかりません' USING ERRCODE = 'P0020';
    END IF;

    IF v_coupon.status != 'active' THEN
      RAISE EXCEPTION 'COUPON_NOT_ACTIVE: このクーポンは利用できません（ステータス: %）', v_coupon.status USING ERRCODE = 'P0021';
    END IF;

    IF v_coupon.uses_remaining <= 0 THEN
      RAISE EXCEPTION 'COUPON_EXHAUSTED: このクーポンの利用回数を超えています' USING ERRCODE = 'P0022';
    END IF;

    IF v_coupon.expires_at IS NOT NULL AND v_coupon.expires_at < now() THEN
      UPDATE customer_coupons SET status = 'expired' WHERE id = v_coupon.id;
      RAISE EXCEPTION 'COUPON_EXPIRED: このクーポンは有効期限を過ぎています' USING ERRCODE = 'P0023';
    END IF;

    SELECT camp.*
    INTO v_campaign
    FROM coupon_campaigns camp
    WHERE camp.id = v_coupon.campaign_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'CAMPAIGN_NOT_FOUND: キャンペーン情報が見つかりません' USING ERRCODE = 'P0024';
    END IF;

    IF NOT v_campaign.is_active THEN
      RAISE EXCEPTION 'CAMPAIGN_INACTIVE: このキャンペーンは終了しています' USING ERRCODE = 'P0025';
    END IF;

    IF v_campaign.valid_from IS NOT NULL AND v_campaign.valid_from > now() THEN
      RAISE EXCEPTION 'CAMPAIGN_NOT_STARTED: このキャンペーンはまだ開始されていません' USING ERRCODE = 'P0026';
    END IF;

    IF v_campaign.valid_until IS NOT NULL AND v_campaign.valid_until < now() THEN
      RAISE EXCEPTION 'CAMPAIGN_ENDED: このキャンペーンは終了しています' USING ERRCODE = 'P0027';
    END IF;

    IF v_campaign.target_type = 'specific_organization' THEN
      IF NOT (v_event_org_id = ANY(v_campaign.target_ids)) THEN
        RAISE EXCEPTION 'COUPON_NOT_APPLICABLE: このクーポンはこの組織の予約には使用できません' USING ERRCODE = 'P0028';
      END IF;
    ELSIF v_campaign.target_type = 'specific_scenarios' THEN
      IF NOT (COALESCE(v_scenario_id, v_org_scenario_id) = ANY(v_campaign.target_ids)) THEN
        RAISE EXCEPTION 'COUPON_NOT_APPLICABLE: このクーポンはこのシナリオの予約には使用できません' USING ERRCODE = 'P0028';
      END IF;
    END IF;

    IF v_campaign.discount_type = 'fixed' THEN
      v_discount_amount := v_campaign.discount_amount;
    ELSIF v_campaign.discount_type = 'percentage' THEN
      v_discount_amount := ROUND(v_total_price * v_campaign.discount_amount / 100.0)::INTEGER;
    END IF;

    IF v_discount_amount > v_total_price THEN
      v_discount_amount := v_total_price;
    END IF;
  END IF;

  v_final_price := v_total_price - v_discount_amount;
  v_requested_datetime := (v_date + v_start_time)::TIMESTAMP;

  IF p_reservation_number IS NULL OR length(trim(p_reservation_number)) = 0 THEN
    v_reservation_number := to_char(now(), 'YYMMDD') || '-' || upper(substr(md5(random()::text), 1, 4));
  ELSE
    v_reservation_number := p_reservation_number;
  END IF;

  INSERT INTO reservations (
    schedule_event_id,
    scenario_id,
    store_id,
    customer_id,
    customer_name,
    customer_email,
    customer_phone,
    requested_datetime,
    duration,
    participant_count,
    participant_names,
    base_price,
    options_price,
    total_price,
    discount_amount,
    final_price,
    unit_price,
    payment_method,
    payment_status,
    status,
    customer_notes,
    reservation_number,
    created_by,
    organization_id,
    title
  ) VALUES (
    p_schedule_event_id,
    COALESCE(v_scenario_id, v_org_scenario_id),
    v_store_id,
    p_customer_id,
    p_customer_name,
    p_customer_email,
    p_customer_phone,
    v_requested_datetime,
    v_duration,
    p_participant_count,
    ARRAY[]::text[],
    v_total_price,
    0,
    v_total_price,
    v_discount_amount,
    v_final_price,
    v_unit_price,
    CASE WHEN p_customer_id IS NULL THEN 'staff' ELSE 'onsite' END,
    'pending',
    'confirmed',
    p_notes,
    v_reservation_number,
    auth.uid(),
    v_event_org_id,
    COALESCE(v_title, '')
  )
  RETURNING id INTO v_reservation_id;

  IF p_customer_coupon_id IS NOT NULL AND v_discount_amount > 0 THEN
    INSERT INTO coupon_usages (
      customer_coupon_id,
      reservation_id,
      discount_amount
    ) VALUES (
      p_customer_coupon_id,
      v_reservation_id,
      v_discount_amount
    )
    RETURNING id INTO v_coupon_usage_id;

    UPDATE reservations SET coupon_usage_id = v_coupon_usage_id WHERE id = v_reservation_id;

    UPDATE customer_coupons
    SET uses_remaining = uses_remaining - 1,
        status = CASE WHEN uses_remaining - 1 <= 0 THEN 'fully_used' ELSE 'active' END
    WHERE id = p_customer_coupon_id;
  END IF;

  -- current_participants は reservations INSERT 後の recalc トリガーが絶対値で再計算する。
  -- checked_in を含まない手動 += はトリガー結果を過小上書きするため削除。

  RETURN v_reservation_id;
END;
$function$;

COMMIT;

-- 本番取得定義を基準に、本人の同番号再試行と連絡先検証を追加。
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
  v_requested_datetime TIMESTAMP;
  v_reservation_number TEXT;

  v_coupon RECORD;
  v_campaign RECORD;
  v_coupon_usage_id UUID;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'UNAUTHORIZED' USING ERRCODE = 'P0011';
  END IF;

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

  -- reservation_actor_auth_v1: 引数ではなくJWTの本人／対象組織の業務権限で判定。
  v_caller_org_id := public.get_user_organization_id();
  v_is_admin := COALESCE(public.reservation_actor_is_org_operator(v_event_org_id), false);
  v_is_staff := v_is_admin;

  -- 店舗の公演募集停止期間中は、お客様からの予約を受け付けない（スタッフの手入力は従来どおり可）
  IF NOT (v_is_admin OR v_is_staff)
     AND public.is_store_recruitment_paused(v_store_id, 'performance', v_date) THEN
    RAISE EXCEPTION 'RECRUITMENT_PAUSED' USING ERRCODE = 'P0046';
  END IF;

  IF p_customer_id IS NULL THEN
    IF NOT (v_is_admin OR v_is_staff) THEN
      RAISE EXCEPTION 'FORBIDDEN_STAFF_ONLY' USING ERRCODE = 'P0013';
    END IF;
    v_customer_user_id := NULL;
    v_customer_org_id := v_event_org_id;
  ELSE
    SELECT user_id, organization_id
    INTO v_customer_user_id, v_customer_org_id
    FROM public.customers
    WHERE id = p_customer_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'CUSTOMER_NOT_FOUND' USING ERRCODE = 'P0009';
    END IF;

    IF v_customer_user_id IS DISTINCT FROM auth.uid()
       AND NOT (v_is_admin OR v_is_staff) THEN
      RAISE EXCEPTION 'FORBIDDEN_CUSTOMER' USING ERRCODE = 'P0011';
    END IF;

    -- 本人の共通顧客は旧organization_idの有無を問わず組織横断で利用できる。
    -- 他人を代理する業務操作では、組織付き顧客は対象公演と同じ組織に限る。
    IF v_customer_org_id IS NOT NULL
       AND v_customer_org_id IS DISTINCT FROM v_event_org_id
       AND v_customer_user_id IS DISTINCT FROM auth.uid() THEN
      RAISE EXCEPTION 'CUSTOMER_ORG_MISMATCH' USING ERRCODE = 'P0012';
    END IF;
  END IF;

  IF NULLIF(btrim(p_reservation_number), '') IS NOT NULL THEN
    SELECT r.id INTO v_reservation_id FROM public.reservations r
    WHERE r.reservation_number=p_reservation_number AND r.organization_id=v_event_org_id
      AND r.schedule_event_id=p_schedule_event_id
      AND r.customer_id IS NOT DISTINCT FROM p_customer_id
      AND r.created_by=auth.uid() AND r.participant_count=p_participant_count
      AND r.status IN ('pending','confirmed','gm_confirmed','checked_in')
      AND r.customer_name IS NOT DISTINCT FROM p_customer_name
      AND r.customer_email IS NOT DISTINCT FROM p_customer_email
      AND r.customer_phone IS NOT DISTINCT FROM p_customer_phone
      AND r.customer_notes IS NOT DISTINCT FROM p_notes
      AND ((r.booking_request_payload IS NULL AND p_how_found IS NULL)
        OR r.booking_request_payload = jsonb_build_object('name',p_customer_name,'email',p_customer_email,'phone',p_customer_phone,'notes',p_notes,'howFound',p_how_found,'coupon',p_customer_coupon_id))
      AND ((p_customer_coupon_id IS NULL AND NOT EXISTS(SELECT 1 FROM public.coupon_usages u WHERE u.reservation_id=r.id))
        OR EXISTS(SELECT 1 FROM public.coupon_usages u WHERE u.reservation_id=r.id AND u.customer_coupon_id=p_customer_coupon_id));
    IF FOUND THEN RETURN v_reservation_id; END IF;
    IF EXISTS(SELECT 1 FROM public.reservations r WHERE r.reservation_number=p_reservation_number) THEN
      RAISE EXCEPTION 'RESERVATION_RETRY_MISMATCH' USING ERRCODE='P0055';
    END IF;
  END IF;

  IF p_customer_id IS NOT NULL AND (p_customer_email IS NULL OR btrim(p_customer_email) !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' OR length(btrim(p_customer_email))>254) THEN
    RAISE EXCEPTION '有効なメールアドレスを入力してください' USING ERRCODE='P0021';
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
    v_discount_amount := public.coupon_discount_for_event(
      p_customer_coupon_id, p_schedule_event_id, v_total_price, p_customer_id, NULL);
  END IF;

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
    booking_request_payload,
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
    0,
    v_total_price,
    v_unit_price,
    CASE WHEN p_customer_id IS NULL THEN 'staff' ELSE 'onsite' END,
    'pending',
    'confirmed',
    p_notes,
    v_reservation_number,
    auth.uid(),
    v_event_org_id,
    jsonb_build_object('name',p_customer_name,'email',p_customer_email,'phone',p_customer_phone,'notes',p_notes,'howFound',p_how_found,'coupon',p_customer_coupon_id),
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
    RETURNING id, discount_amount INTO v_coupon_usage_id, v_discount_amount;

    -- usage trigger validates against the undiscounted balance; use its actual amount everywhere.
    UPDATE reservations SET coupon_usage_id = v_coupon_usage_id,
      discount_amount = v_discount_amount, final_price = v_total_price - v_discount_amount
    WHERE id = v_reservation_id;
    INSERT INTO public.coupon_usage_billing_applied(usage_id,applied_amount) VALUES(v_coupon_usage_id,v_discount_amount);

  END IF;

  -- current_participants は reservations INSERT 後の recalc トリガーが絶対値で再計算する。
  -- checked_in を含まない手動 += はトリガー結果を過小上書きするため削除。

  RETURN v_reservation_id;
END;
$function$;

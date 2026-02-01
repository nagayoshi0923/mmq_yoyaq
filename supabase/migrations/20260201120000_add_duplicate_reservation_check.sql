-- =============================================================================
-- 🔒 セキュリティ修正: 重複予約チェックをサーバー側に追加
-- 
-- 問題: 重複予約チェックはフロントエンドのみで実施されており、
--       RPC関数を直接呼び出すことで同じ公演に複数回予約できてしまう
-- 
-- 解決: create_reservation_with_lock_v2 に重複チェックを追加
-- =============================================================================

CREATE OR REPLACE FUNCTION create_reservation_with_lock_v2(
  p_schedule_event_id UUID,
  p_participant_count INTEGER,
  p_customer_id UUID,
  p_customer_name TEXT,
  p_customer_email TEXT,
  p_customer_phone TEXT,
  p_notes TEXT DEFAULT NULL,
  p_how_found TEXT DEFAULT NULL,
  p_reservation_number TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_max_participants INTEGER;
  v_current_participants INTEGER;
  v_available_seats INTEGER;
  v_reservation_id UUID;

  v_event_org_id UUID;
  v_scenario_id UUID;
  v_store_id UUID;
  v_date DATE;
  v_start_time TIME;
  v_duration INTEGER;
  v_title TEXT;

  v_customer_user_id UUID;
  v_customer_org_id UUID;
  v_caller_org_id UUID;
  v_is_admin BOOLEAN;

  v_participation_fee INTEGER;
  v_participation_costs JSONB;
  v_time_slot TEXT;
  v_time_slot_cost JSONB;

  v_unit_price INTEGER;
  v_total_price INTEGER;
  v_final_price INTEGER;
  v_requested_datetime TIMESTAMP;
  v_reservation_number TEXT;
  
  -- 🔒 重複チェック用
  v_existing_reservation_id UUID;
BEGIN
  IF p_participant_count <= 0 THEN
    RAISE EXCEPTION 'INVALID_PARTICIPANT_COUNT' USING ERRCODE = 'P0001';
  END IF;

  -- 公演行をロック + 組織/定員を取得
  SELECT organization_id,
         scenario_id,
         store_id,
         date,
         start_time,
         COALESCE(max_participants, capacity, 8)
  INTO v_event_org_id, v_scenario_id, v_store_id, v_date, v_start_time, v_max_participants
  FROM schedule_events
  WHERE id = p_schedule_event_id
    AND is_cancelled = false
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'EVENT_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  -- 認可（admin / staff(自組織) / customer(本人+組織一致)）
  v_caller_org_id := get_user_organization_id();
  v_is_admin := is_org_admin();

  SELECT user_id, organization_id
  INTO v_customer_user_id, v_customer_org_id
  FROM customers
  WHERE id = p_customer_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'CUSTOMER_NOT_FOUND' USING ERRCODE = 'P0009';
  END IF;

  IF v_is_admin THEN
    NULL;
  ELSIF v_caller_org_id IS NOT NULL THEN
    IF v_caller_org_id != v_event_org_id THEN
      RAISE EXCEPTION 'FORBIDDEN_ORG' USING ERRCODE = 'P0010';
    END IF;
  ELSE
    IF v_customer_user_id IS DISTINCT FROM auth.uid() THEN
      RAISE EXCEPTION 'FORBIDDEN_CUSTOMER' USING ERRCODE = 'P0011';
    END IF;
  END IF;

  IF v_customer_org_id IS DISTINCT FROM v_event_org_id THEN
    RAISE EXCEPTION 'CUSTOMER_ORG_MISMATCH' USING ERRCODE = 'P0012';
  END IF;

  -- ==========================================================================
  -- 🔒 重複予約チェック（新規追加）
  -- 同じ公演に対して同じcustomer_idまたはcustomer_emailで既に予約がある場合は拒否
  -- ==========================================================================
  SELECT id INTO v_existing_reservation_id
  FROM reservations
  WHERE schedule_event_id = p_schedule_event_id
    AND (
      customer_id = p_customer_id 
      OR (customer_email IS NOT NULL AND customer_email = p_customer_email)
    )
    AND status IN ('pending', 'confirmed', 'gm_confirmed')
  LIMIT 1;

  IF v_existing_reservation_id IS NOT NULL THEN
    RAISE EXCEPTION 'DUPLICATE_RESERVATION' 
      USING ERRCODE = 'P0039',
            HINT = 'この公演には既に予約があります。予約の変更はマイページから行ってください。';
  END IF;
  -- ==========================================================================

  -- 在庫チェック（現在人数を集計）
  SELECT COALESCE(SUM(participant_count), 0)
  INTO v_current_participants
  FROM reservations
  WHERE schedule_event_id = p_schedule_event_id
    AND status IN ('pending', 'confirmed', 'gm_confirmed');

  v_available_seats := v_max_participants - v_current_participants;

  IF v_available_seats <= 0 THEN
    RAISE EXCEPTION 'SOLD_OUT' USING ERRCODE = 'P0003';
  END IF;

  IF p_participant_count > v_available_seats THEN
    RAISE EXCEPTION 'INSUFFICIENT_SEATS' USING ERRCODE = 'P0004';
  END IF;

  -- 料金計算（サーバー側）
  SELECT participation_fee, participation_costs, duration, title
  INTO v_participation_fee, v_participation_costs, v_duration, v_title
  FROM scenarios
  WHERE id = v_scenario_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'SCENARIO_NOT_FOUND' USING ERRCODE = 'P0017';
  END IF;

  -- time_slot 判定（フロントの getTimeSlot と合わせる: morning/afternoon/evening）
  IF EXTRACT(HOUR FROM v_start_time) < 12 THEN
    v_time_slot := 'morning';
  ELSIF EXTRACT(HOUR FROM v_start_time) < 18 THEN
    v_time_slot := 'afternoon';
  ELSE
    v_time_slot := 'evening';
  END IF;

  -- participation_costs から該当を取得（status がない場合は有効扱い）
  -- 優先: time_slot一致 → '通常' → participation_fee
  v_time_slot_cost := NULL;
  IF v_participation_costs IS NOT NULL AND jsonb_typeof(v_participation_costs) = 'array' THEN
    SELECT elem
    INTO v_time_slot_cost
    FROM jsonb_array_elements(v_participation_costs) elem
    WHERE COALESCE(elem->>'status', 'active') = 'active'
      AND elem->>'time_slot' = v_time_slot
    LIMIT 1;

    IF v_time_slot_cost IS NULL THEN
      SELECT elem
      INTO v_time_slot_cost
      FROM jsonb_array_elements(v_participation_costs) elem
      WHERE COALESCE(elem->>'status', 'active') = 'active'
        AND elem->>'time_slot' = '通常'
      LIMIT 1;
    END IF;
  END IF;

  IF v_time_slot_cost IS NOT NULL THEN
    IF v_time_slot_cost->>'type' = 'percentage' THEN
      IF v_participation_fee IS NULL THEN
        RAISE EXCEPTION 'SCENARIO_FEE_NOT_FOUND' USING ERRCODE = 'P0017';
      END IF;
      v_unit_price := ROUND(v_participation_fee * (1 + (COALESCE((v_time_slot_cost->>'amount')::NUMERIC, 0) / 100)))::INTEGER;
    ELSE
      v_unit_price := COALESCE((v_time_slot_cost->>'amount')::INTEGER, NULL);
    END IF;
  ELSE
    v_unit_price := v_participation_fee;
  END IF;

  IF v_unit_price IS NULL THEN
    RAISE EXCEPTION 'SCENARIO_FEE_NOT_FOUND' USING ERRCODE = 'P0017';
  END IF;

  v_total_price := v_unit_price * p_participant_count;
  v_final_price := v_total_price;

  -- requested_datetime はイベントから確定
  v_requested_datetime := (v_date + v_start_time)::TIMESTAMP;

  -- reservation_number（未指定なら生成）
  IF p_reservation_number IS NULL OR length(trim(p_reservation_number)) = 0 THEN
    v_reservation_number := to_char(now(), 'YYMMDD') || '-' || upper(substr(md5(random()::text), 1, 4));
  ELSE
    v_reservation_number := p_reservation_number;
  END IF;

  -- 予約を挿入（クライアント計算値は使わない）
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
    v_scenario_id,
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
    v_final_price,
    v_unit_price,
    'onsite',
    'pending',
    'confirmed',
    p_notes,
    v_reservation_number,
    auth.uid(),
    v_event_org_id,
    COALESCE(v_title, '')
  )
  RETURNING id INTO v_reservation_id;

  -- current_participants を更新（既存の整合性運用に合わせる）
  UPDATE schedule_events
  SET current_participants = v_current_participants + p_participant_count
  WHERE id = p_schedule_event_id;

  RETURN v_reservation_id;
END;
$$;

-- 確認
DO $$
BEGIN
  RAISE NOTICE '✅ create_reservation_with_lock_v2 に重複予約チェックを追加しました';
  RAISE NOTICE '   - 同じ公演への重複予約は DUPLICATE_RESERVATION (P0039) エラーになります';
END $$;

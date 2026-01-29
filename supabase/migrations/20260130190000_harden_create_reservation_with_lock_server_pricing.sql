-- =============================================================================
-- 20260130190000: create_reservation_with_lock を安全化（料金/日時をサーバー確定）
-- =============================================================================
--
-- SEC-P0-02 対策:
-- - 既存の create_reservation_with_lock は「クライアント入力（料金/日時）」をそのままINSERTしており、
--   API直叩きで料金改ざん・日時改ざんが成立する。
-- - 互換性を壊さないため、関数シグネチャは維持したまま、料金/日時をサーバー側で確定する。
--
-- 方針:
-- - requested_datetime: schedule_events(date, start_time) から確定（入力値は無視）
-- - 料金: scenarios(participation_fee, participation_costs) からサーバー計算（入力値は無視）
-- - scenario_id/store_id: 原則 schedule_events の値を使用（無ければ引数をフォールバック）
--
-- 依存:
-- - scenarios.participation_costs (jsonb) が存在する想定（無い場合は participation_fee を使用）
--
-- =============================================================================

CREATE OR REPLACE FUNCTION public.create_reservation_with_lock(
  p_schedule_event_id uuid,
  p_participant_count integer,
  p_customer_id uuid,
  p_customer_name text,
  p_customer_email text,
  p_customer_phone text,
  p_scenario_id uuid,
  p_store_id uuid,
  p_requested_datetime timestamp with time zone,
  p_duration integer,
  p_base_price integer,
  p_total_price integer,
  p_unit_price integer,
  p_reservation_number text,
  p_notes text,
  p_created_by uuid,
  p_organization_id uuid,
  p_title text
)
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
  v_event_scenario_id UUID;
  v_event_store_id UUID;
  v_date DATE;
  v_start_time TIME;

  v_customer_user_id UUID;
  v_customer_org_id UUID;
  v_caller_org_id UUID;
  v_is_admin BOOLEAN;

  v_duration INTEGER;
  v_title TEXT;

  v_participation_fee INTEGER;
  v_participation_costs JSONB;
  v_time_slot TEXT;
  v_time_slot_cost JSONB;
  v_unit_price INTEGER;
  v_total_price INTEGER;
  v_final_price INTEGER;
  v_requested_datetime TIMESTAMPTZ;

  v_scenario_id UUID;
  v_store_id UUID;
BEGIN
  IF p_participant_count <= 0 THEN
    RAISE EXCEPTION 'INVALID_PARTICIPANT_COUNT' USING ERRCODE = 'P0001';
  END IF;

  -- 公演をロックして必要情報を取得
  SELECT organization_id,
         scenario_id,
         store_id,
         date,
         start_time,
         COALESCE(max_participants, capacity, 8)
  INTO v_event_org_id, v_event_scenario_id, v_event_store_id, v_date, v_start_time, v_max_participants
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

  -- scenario_id/store_id はイベント側を優先（なければ引数を使用）
  v_scenario_id := COALESCE(v_event_scenario_id, p_scenario_id);
  v_store_id := COALESCE(v_event_store_id, p_store_id);

  IF v_scenario_id IS NULL THEN
    RAISE EXCEPTION 'SCENARIO_NOT_FOUND' USING ERRCODE = 'P0017';
  END IF;

  -- 料金計算（サーバー側）
  SELECT participation_fee, participation_costs, duration, title
  INTO v_participation_fee, v_participation_costs, v_duration, v_title
  FROM scenarios
  WHERE id = v_scenario_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'SCENARIO_NOT_FOUND' USING ERRCODE = 'P0017';
  END IF;

  -- time_slot 判定（morning/afternoon/evening）
  IF EXTRACT(HOUR FROM v_start_time) < 12 THEN
    v_time_slot := 'morning';
  ELSIF EXTRACT(HOUR FROM v_start_time) < 18 THEN
    v_time_slot := 'afternoon';
  ELSE
    v_time_slot := 'evening';
  END IF;

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

  -- requested_datetime はイベントから確定（入力値は無視）
  v_requested_datetime := (v_date + v_start_time)::TIMESTAMPTZ;

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
    COALESCE(v_duration, p_duration),
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
    p_reservation_number,
    auth.uid(),
    v_event_org_id,
    COALESCE(v_title, p_title, '')
  ) RETURNING id INTO v_reservation_id;

  UPDATE schedule_events
  SET current_participants = v_current_participants + p_participant_count
  WHERE id = p_schedule_event_id;

  RETURN v_reservation_id;
END;
$function$;

COMMENT ON FUNCTION public.create_reservation_with_lock IS
'予約作成（互換維持版）。料金/日時はサーバー側で確定し、クライアント入力の改ざん余地を排除する。';


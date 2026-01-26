-- =============================================================================
-- RPC認可強化 + 通知トリガー保護 + 在庫整合性トリガー
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1) 通知作成関数: RLSバイパスを明示
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION create_notification(
  p_user_id UUID,
  p_customer_id UUID,
  p_organization_id UUID,
  p_type TEXT,
  p_title TEXT,
  p_message TEXT,
  p_link TEXT DEFAULT NULL,
  p_related_reservation_id UUID DEFAULT NULL,
  p_related_event_id UUID DEFAULT NULL,
  p_related_waitlist_id UUID DEFAULT NULL,
  p_metadata JSONB DEFAULT '{}'
)
RETURNS UUID
SECURITY DEFINER
SET search_path = public
SET row_security = off
LANGUAGE plpgsql
AS $$
DECLARE
  v_notification_id UUID;
BEGIN
  INSERT INTO user_notifications (
    user_id,
    customer_id,
    organization_id,
    type,
    title,
    message,
    link,
    related_reservation_id,
    related_event_id,
    related_waitlist_id,
    metadata
  ) VALUES (
    p_user_id,
    p_customer_id,
    p_organization_id,
    p_type,
    p_title,
    p_message,
    p_link,
    p_related_reservation_id,
    p_related_event_id,
    p_related_waitlist_id,
    p_metadata
  )
  RETURNING id INTO v_notification_id;

  RETURN v_notification_id;
END;
$$;

-- -----------------------------------------------------------------------------
-- 2) 在庫整合性トリガー（UPDATE経路でもcurrent_participantsを維持）
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION recalc_current_participants_for_event(p_event_id UUID)
RETURNS VOID
SECURITY DEFINER
SET search_path = public
SET row_security = off
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE schedule_events se
  SET current_participants = COALESCE((
    SELECT SUM(r.participant_count)
    FROM reservations r
    WHERE r.schedule_event_id = se.id
      AND r.status IN ('pending', 'confirmed', 'gm_confirmed')
  ), 0)
  WHERE se.id = p_event_id;
END;
$$;

CREATE OR REPLACE FUNCTION recalc_current_participants_trigger()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
SET row_security = off
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.schedule_event_id IS DISTINCT FROM NEW.schedule_event_id THEN
    PERFORM recalc_current_participants_for_event(OLD.schedule_event_id);
    PERFORM recalc_current_participants_for_event(NEW.schedule_event_id);
  ELSE
    PERFORM recalc_current_participants_for_event(NEW.schedule_event_id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_recalc_participants ON reservations;

CREATE TRIGGER trigger_recalc_participants
AFTER INSERT OR UPDATE OF participant_count, status, schedule_event_id ON reservations
FOR EACH ROW
EXECUTE FUNCTION recalc_current_participants_trigger();

-- -----------------------------------------------------------------------------
-- 3) RPC認可強化（auth.uid() / org境界の検証）
-- -----------------------------------------------------------------------------

-- 予約作成
CREATE OR REPLACE FUNCTION create_reservation_with_lock(
  p_schedule_event_id UUID,
  p_participant_count INTEGER,
  p_customer_id UUID,
  p_customer_name TEXT,
  p_customer_email TEXT,
  p_customer_phone TEXT,
  p_scenario_id UUID,
  p_store_id UUID,
  p_requested_datetime TIMESTAMPTZ,
  p_duration INTEGER,
  p_base_price INTEGER,
  p_total_price INTEGER,
  p_unit_price INTEGER,
  p_reservation_number TEXT,
  p_notes TEXT,
  p_created_by UUID,
  p_organization_id UUID,
  p_title TEXT
) RETURNS UUID
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql AS $$
DECLARE
  v_max_participants INTEGER;
  v_current_participants INTEGER;
  v_available_seats INTEGER;
  v_reservation_id UUID;
  v_event_org_id UUID;
  v_customer_user_id UUID;
  v_customer_org_id UUID;
  v_caller_org_id UUID;
  v_is_admin BOOLEAN;
BEGIN
  IF p_participant_count <= 0 THEN
    RAISE EXCEPTION 'INVALID_PARTICIPANT_COUNT' USING ERRCODE = 'P0001';
  END IF;

  SELECT organization_id, COALESCE(max_participants, capacity, 8)
  INTO v_event_org_id, v_max_participants
  FROM schedule_events
  WHERE id = p_schedule_event_id
    AND is_cancelled = false
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'EVENT_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

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
    -- adminは全組織許可
    NULL;
  ELSIF v_caller_org_id IS NOT NULL THEN
    -- staffは自組織のみ
    IF v_caller_org_id != v_event_org_id THEN
      RAISE EXCEPTION 'FORBIDDEN_ORG' USING ERRCODE = 'P0010';
    END IF;
  ELSE
    -- customerは自分のみ + 組織一致
    IF v_customer_user_id IS DISTINCT FROM auth.uid() THEN
      RAISE EXCEPTION 'FORBIDDEN_CUSTOMER' USING ERRCODE = 'P0011';
    END IF;
  END IF;

  IF v_customer_org_id IS DISTINCT FROM v_event_org_id THEN
    RAISE EXCEPTION 'CUSTOMER_ORG_MISMATCH' USING ERRCODE = 'P0012';
  END IF;

  -- 現在参加人数を予約テーブルから集計（最新値）
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
    p_scenario_id,
    p_store_id,
    p_customer_id,
    p_customer_name,
    p_customer_email,
    p_customer_phone,
    p_requested_datetime,
    p_duration,
    p_participant_count,
    ARRAY[]::text[],
    p_base_price,
    0,
    p_total_price,
    0,
    p_total_price,
    p_unit_price,
    'onsite',
    'pending',
    'confirmed',
    p_notes,
    p_reservation_number,
    auth.uid(),
    v_event_org_id,
    COALESCE(p_title, '')
  ) RETURNING id INTO v_reservation_id;

  UPDATE schedule_events
  SET current_participants = v_current_participants + p_participant_count
  WHERE id = p_schedule_event_id;

  RETURN v_reservation_id;
END;
$$;

-- 予約キャンセル
CREATE OR REPLACE FUNCTION cancel_reservation_with_lock(
  p_reservation_id UUID,
  p_customer_id UUID,
  p_cancellation_reason TEXT DEFAULT NULL
) RETURNS BOOLEAN
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql AS $$
DECLARE
  v_event_id UUID;
  v_count INTEGER;
  v_res_org_id UUID;
  v_res_customer_id UUID;
  v_res_customer_user_id UUID;
  v_caller_org_id UUID;
  v_is_admin BOOLEAN;
BEGIN
  SELECT schedule_event_id, participant_count, organization_id, customer_id
  INTO v_event_id, v_count, v_res_org_id, v_res_customer_id
  FROM reservations
  WHERE id = p_reservation_id
    AND status != 'cancelled'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'RESERVATION_NOT_FOUND' USING ERRCODE = 'P0005';
  END IF;

  v_caller_org_id := get_user_organization_id();
  v_is_admin := is_org_admin();

  SELECT user_id INTO v_res_customer_user_id
  FROM customers
  WHERE id = v_res_customer_id;

  IF v_is_admin THEN
    NULL;
  ELSIF v_caller_org_id IS NOT NULL THEN
    IF v_caller_org_id != v_res_org_id THEN
      RAISE EXCEPTION 'FORBIDDEN_ORG' USING ERRCODE = 'P0010';
    END IF;
  ELSE
    IF v_res_customer_user_id IS DISTINCT FROM auth.uid() THEN
      RAISE EXCEPTION 'FORBIDDEN_CUSTOMER' USING ERRCODE = 'P0011';
    END IF;
  END IF;

  UPDATE schedule_events
  SET current_participants = GREATEST(current_participants - v_count, 0)
  WHERE id = v_event_id;

  UPDATE reservations
  SET status = 'cancelled',
      cancelled_at = NOW(),
      cancellation_reason = COALESCE(p_cancellation_reason, cancellation_reason)
  WHERE id = p_reservation_id;

  RETURN TRUE;
END;
$$;

-- 参加人数変更
CREATE OR REPLACE FUNCTION update_reservation_participants(
  p_reservation_id UUID,
  p_new_count INTEGER,
  p_customer_id UUID
) RETURNS BOOLEAN
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql AS $$
DECLARE
  v_event_id UUID;
  v_old_count INTEGER;
  v_diff INTEGER;
  v_max_participants INTEGER;
  v_current_participants INTEGER;
  v_res_org_id UUID;
  v_res_customer_id UUID;
  v_res_customer_user_id UUID;
  v_caller_org_id UUID;
  v_is_admin BOOLEAN;
BEGIN
  IF p_new_count <= 0 THEN
    RAISE EXCEPTION 'INVALID_PARTICIPANT_COUNT' USING ERRCODE = 'P0006';
  END IF;

  SELECT schedule_event_id, participant_count, organization_id, customer_id
  INTO v_event_id, v_old_count, v_res_org_id, v_res_customer_id
  FROM reservations
  WHERE id = p_reservation_id
    AND status != 'cancelled'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'RESERVATION_NOT_FOUND' USING ERRCODE = 'P0007';
  END IF;

  v_caller_org_id := get_user_organization_id();
  v_is_admin := is_org_admin();

  SELECT user_id INTO v_res_customer_user_id
  FROM customers
  WHERE id = v_res_customer_id;

  IF v_is_admin THEN
    NULL;
  ELSIF v_caller_org_id IS NOT NULL THEN
    IF v_caller_org_id != v_res_org_id THEN
      RAISE EXCEPTION 'FORBIDDEN_ORG' USING ERRCODE = 'P0010';
    END IF;
  ELSE
    IF v_res_customer_user_id IS DISTINCT FROM auth.uid() THEN
      RAISE EXCEPTION 'FORBIDDEN_CUSTOMER' USING ERRCODE = 'P0011';
    END IF;
  END IF;

  v_diff := p_new_count - v_old_count;

  IF v_diff > 0 THEN
    SELECT COALESCE(max_participants, capacity, 8)
    INTO v_max_participants
    FROM schedule_events
    WHERE id = v_event_id
    FOR UPDATE;

    SELECT COALESCE(SUM(participant_count), 0)
    INTO v_current_participants
    FROM reservations
    WHERE schedule_event_id = v_event_id
      AND status IN ('pending', 'confirmed', 'gm_confirmed');

    IF v_current_participants + v_diff > v_max_participants THEN
      RAISE EXCEPTION 'INSUFFICIENT_SEATS' USING ERRCODE = 'P0008';
    END IF;
  END IF;

  UPDATE reservations
  SET participant_count = p_new_count
  WHERE id = p_reservation_id;

  UPDATE schedule_events
  SET current_participants = current_participants + v_diff
  WHERE id = v_event_id;

  RETURN TRUE;
END;
$$;


-- =============================================================================
-- 予約のアトミック処理 + RLS強化
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1) RPC: 予約作成（悲観ロック）
-- -----------------------------------------------------------------------------
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
BEGIN
  IF p_participant_count <= 0 THEN
    RAISE EXCEPTION 'INVALID_PARTICIPANT_COUNT' USING ERRCODE = 'P0001';
  END IF;

  -- 行ロック + 公演確認
  SELECT COALESCE(max_participants, capacity, 8)
  INTO v_max_participants
  FROM schedule_events
  WHERE id = p_schedule_event_id
    AND organization_id = p_organization_id
    AND is_cancelled = false
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'EVENT_NOT_FOUND' USING ERRCODE = 'P0002';
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
    p_created_by,
    p_organization_id,
    COALESCE(p_title, '')
  ) RETURNING id INTO v_reservation_id;

  UPDATE schedule_events
  SET current_participants = v_current_participants + p_participant_count
  WHERE id = p_schedule_event_id;

  RETURN v_reservation_id;
END;
$$;

GRANT EXECUTE ON FUNCTION create_reservation_with_lock TO authenticated;

-- -----------------------------------------------------------------------------
-- 2) RPC: 予約キャンセル（在庫返却）
-- -----------------------------------------------------------------------------
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
BEGIN
  SELECT schedule_event_id, participant_count
  INTO v_event_id, v_count
  FROM reservations
  WHERE id = p_reservation_id
    AND customer_id = p_customer_id
    AND status != 'cancelled'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'RESERVATION_NOT_FOUND' USING ERRCODE = 'P0005';
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

GRANT EXECUTE ON FUNCTION cancel_reservation_with_lock TO authenticated;

-- -----------------------------------------------------------------------------
-- 3) RPC: 参加人数変更（差分調整）
-- -----------------------------------------------------------------------------
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
BEGIN
  IF p_new_count <= 0 THEN
    RAISE EXCEPTION 'INVALID_PARTICIPANT_COUNT' USING ERRCODE = 'P0006';
  END IF;

  SELECT schedule_event_id, participant_count
  INTO v_event_id, v_old_count
  FROM reservations
  WHERE id = p_reservation_id
    AND customer_id = p_customer_id
    AND status != 'cancelled'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'RESERVATION_NOT_FOUND' USING ERRCODE = 'P0007';
  END IF;

  v_diff := p_new_count - v_old_count;

  -- 増加時のみ在庫確認
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

GRANT EXECUTE ON FUNCTION update_reservation_participants TO authenticated;

-- -----------------------------------------------------------------------------
-- 4) CHECK制約（二重防御・NOT VALID）
-- -----------------------------------------------------------------------------
ALTER TABLE schedule_events
  ADD CONSTRAINT schedule_events_participants_check
  CHECK (current_participants <= COALESCE(max_participants, capacity))
  NOT VALID;

-- -----------------------------------------------------------------------------
-- 5) waitlist: customer_id を NOT NULL 化（既存データ補正）
-- -----------------------------------------------------------------------------
UPDATE waitlist w
SET customer_id = c.id
FROM customers c
WHERE w.customer_id IS NULL
  AND c.email = w.customer_email;

DELETE FROM waitlist
WHERE customer_id IS NULL;

ALTER TABLE waitlist
  ALTER COLUMN customer_id SET NOT NULL;

-- -----------------------------------------------------------------------------
-- 6) RLSポリシー強化
-- -----------------------------------------------------------------------------

-- reservations
DO $$ BEGIN
  DROP POLICY IF EXISTS reservations_strict ON reservations;
  DROP POLICY IF EXISTS reservations_org_policy ON reservations;
  DROP POLICY IF EXISTS reservations_select ON reservations;
  DROP POLICY IF EXISTS reservations_insert ON reservations;
  DROP POLICY IF EXISTS reservations_update ON reservations;
  DROP POLICY IF EXISTS reservations_delete ON reservations;
EXCEPTION WHEN undefined_table THEN NULL; END $$;

CREATE POLICY reservations_select ON reservations
  FOR SELECT USING (
    customer_id IN (SELECT id FROM customers WHERE user_id = auth.uid())
    OR organization_id = get_user_organization_id()
    OR is_org_admin()
  );

CREATE POLICY reservations_insert ON reservations
  FOR INSERT WITH CHECK (FALSE);

CREATE POLICY reservations_update ON reservations
  FOR UPDATE USING (
    organization_id = get_user_organization_id()
    OR is_org_admin()
  ) WITH CHECK (
    organization_id = get_user_organization_id()
    OR is_org_admin()
  );

CREATE POLICY reservations_delete ON reservations
  FOR DELETE USING (FALSE);

-- customers
DO $$ BEGIN
  DROP POLICY IF EXISTS customers_strict ON customers;
  DROP POLICY IF EXISTS customers_org_policy ON customers;
  DROP POLICY IF EXISTS customers_select ON customers;
  DROP POLICY IF EXISTS customers_insert ON customers;
  DROP POLICY IF EXISTS customers_update_staff ON customers;
  DROP POLICY IF EXISTS customers_update_own ON customers;
  DROP POLICY IF EXISTS customers_delete ON customers;
EXCEPTION WHEN undefined_table THEN NULL; END $$;

CREATE POLICY customers_select ON customers
  FOR SELECT USING (
    user_id = auth.uid()
    OR organization_id = get_user_organization_id()
    OR is_org_admin()
  );

CREATE POLICY customers_insert ON customers
  FOR INSERT WITH CHECK (
    user_id = auth.uid()
    AND organization_id IS NOT NULL
  );

CREATE POLICY customers_update_staff ON customers
  FOR UPDATE USING (
    organization_id = get_user_organization_id()
    OR is_org_admin()
  ) WITH CHECK (
    organization_id = get_user_organization_id()
    OR is_org_admin()
  );

CREATE POLICY customers_update_own ON customers
  FOR UPDATE USING (
    user_id = auth.uid()
  ) WITH CHECK (
    user_id = auth.uid()
    AND organization_id = (
      SELECT organization_id FROM customers c WHERE c.id = customers.id
    )
  );

CREATE POLICY customers_delete ON customers
  FOR DELETE USING (FALSE);

-- waitlist
DO $$ BEGIN
  DROP POLICY IF EXISTS "Organization members can view waitlist" ON waitlist;
  DROP POLICY IF EXISTS "Organization members can insert waitlist" ON waitlist;
  DROP POLICY IF EXISTS "Organization members can update waitlist" ON waitlist;
  DROP POLICY IF EXISTS "Organization members can delete waitlist" ON waitlist;
  DROP POLICY IF EXISTS "Anyone can insert waitlist" ON waitlist;
EXCEPTION WHEN undefined_table THEN NULL; END $$;

CREATE POLICY "Users can view own or org waitlist" ON waitlist
  FOR SELECT USING (
    customer_email = auth.email()
    OR organization_id IN (
      SELECT organization_id FROM staff WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Authenticated users can insert waitlist" ON waitlist
  FOR INSERT WITH CHECK (
    auth.uid() IS NOT NULL
    AND (
      (
        customer_id IN (SELECT id FROM customers WHERE user_id = auth.uid())
        AND customer_email = auth.email()
      )
      OR organization_id IN (
        SELECT organization_id FROM staff WHERE user_id = auth.uid()
      )
    )
  );

CREATE POLICY "Users can update own or org waitlist" ON waitlist
  FOR UPDATE USING (
    customer_email = auth.email()
    OR organization_id IN (
      SELECT organization_id FROM staff WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete own or org waitlist" ON waitlist
  FOR DELETE USING (
    customer_email = auth.email()
    OR organization_id IN (
      SELECT organization_id FROM staff WHERE user_id = auth.uid()
    )
  );

-- private_booking_requests
DO $$ BEGIN
  DROP POLICY IF EXISTS private_booking_requests_strict ON private_booking_requests;
  DROP POLICY IF EXISTS private_booking_admin_staff_policy ON private_booking_requests;
  DROP POLICY IF EXISTS private_booking_customer_policy ON private_booking_requests;
  DROP POLICY IF EXISTS private_booking_requests_select ON private_booking_requests;
  DROP POLICY IF EXISTS private_booking_requests_insert ON private_booking_requests;
  DROP POLICY IF EXISTS private_booking_requests_update ON private_booking_requests;
  DROP POLICY IF EXISTS private_booking_requests_delete ON private_booking_requests;
EXCEPTION WHEN undefined_table THEN NULL; END $$;

CREATE POLICY private_booking_requests_select ON private_booking_requests
  FOR SELECT USING (
    customer_email = auth.email()
    OR organization_id = get_user_organization_id()
    OR is_org_admin()
  );

CREATE POLICY private_booking_requests_insert ON private_booking_requests
  FOR INSERT WITH CHECK (
    (auth.uid() IS NOT NULL AND customer_email = auth.email())
    OR organization_id = get_user_organization_id()
    OR is_org_admin()
  );

CREATE POLICY private_booking_requests_update ON private_booking_requests
  FOR UPDATE USING (
    organization_id = get_user_organization_id()
    OR is_org_admin()
  ) WITH CHECK (
    organization_id = get_user_organization_id()
    OR is_org_admin()
  );

CREATE POLICY private_booking_requests_delete ON private_booking_requests
  FOR DELETE USING (FALSE);

-- scenario_likes
DO $$ BEGIN
  DROP POLICY IF EXISTS scenario_likes_strict ON scenario_likes;
  DROP POLICY IF EXISTS scenario_likes_select ON scenario_likes;
  DROP POLICY IF EXISTS scenario_likes_insert ON scenario_likes;
  DROP POLICY IF EXISTS scenario_likes_update ON scenario_likes;
  DROP POLICY IF EXISTS scenario_likes_delete ON scenario_likes;
EXCEPTION WHEN undefined_table THEN NULL; END $$;

CREATE POLICY scenario_likes_select ON scenario_likes
  FOR SELECT USING (TRUE);

CREATE POLICY scenario_likes_insert ON scenario_likes
  FOR INSERT WITH CHECK (
    customer_id IN (SELECT id FROM customers WHERE user_id = auth.uid())
    AND organization_id IS NOT NULL
  );

CREATE POLICY scenario_likes_delete ON scenario_likes
  FOR DELETE USING (
    customer_id IN (SELECT id FROM customers WHERE user_id = auth.uid())
  );

CREATE POLICY scenario_likes_update ON scenario_likes
  FOR UPDATE USING (FALSE);

-- user_notifications
DO $$ BEGIN
  DROP POLICY IF EXISTS "Allow insert for triggers" ON user_notifications;
  DROP POLICY IF EXISTS "Block direct insert" ON user_notifications;
EXCEPTION WHEN undefined_table THEN NULL; END $$;

CREATE POLICY "Block direct insert" ON user_notifications
  FOR INSERT WITH CHECK (FALSE);




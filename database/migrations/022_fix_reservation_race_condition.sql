-- =============================================================================
-- 022: 予約競合状態の修正
-- =============================================================================
-- 問題: 同時予約時に残席を超えて予約できる可能性があった
-- 対策: reservations テーブルのカウントクエリに FOR UPDATE を追加
-- =============================================================================

-- create_reservation_with_lock を更新
-- reservations へのカウントクエリに FOR UPDATE を追加して競合を防止
CREATE OR REPLACE FUNCTION create_reservation_with_lock(
  p_schedule_event_id UUID,
  p_customer_id UUID,
  p_customer_name TEXT,
  p_customer_email TEXT,
  p_customer_phone TEXT,
  p_participant_count INTEGER,
  p_notes TEXT DEFAULT NULL,
  p_how_found TEXT DEFAULT NULL
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
  v_scenario_id UUID;
  v_store_id UUID;
  v_date DATE;
  v_start_time TIME;
  v_duration INTEGER;
  v_title TEXT;
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

  -- schedule_events をロック
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

  -- 🔒 現在参加人数を予約テーブルから集計（FOR UPDATE で行ロック）
  SELECT COALESCE(SUM(participant_count), 0)
  INTO v_current_participants
  FROM reservations
  WHERE schedule_event_id = p_schedule_event_id
    AND status IN ('pending', 'confirmed', 'gm_confirmed')
  FOR UPDATE;

  v_available_seats := v_max_participants - v_current_participants;

  IF v_available_seats <= 0 THEN
    RAISE EXCEPTION 'SOLD_OUT' USING ERRCODE = 'P0003';
  END IF;

  IF p_participant_count > v_available_seats THEN
    RAISE EXCEPTION 'INSUFFICIENT_SEATS' USING ERRCODE = 'P0004';
  END IF;

  -- イベント情報を取得
  SELECT scenario_id, store_id, date, start_time, scenarios.duration, scenarios.title
  INTO v_scenario_id, v_store_id, v_date, v_start_time, v_duration, v_title
  FROM schedule_events
  LEFT JOIN scenarios ON scenarios.id = schedule_events.scenario_id
  WHERE schedule_events.id = p_schedule_event_id;

  -- 予約を挿入
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
    status,
    notes,
    how_found,
    title,
    organization_id
  ) VALUES (
    p_schedule_event_id,
    v_scenario_id,
    v_store_id,
    p_customer_id,
    p_customer_name,
    p_customer_email,
    p_customer_phone,
    (v_date + v_start_time)::TIMESTAMP,
    v_duration,
    p_participant_count,
    'pending',
    p_notes,
    p_how_found,
    v_title,
    v_event_org_id
  )
  RETURNING id INTO v_reservation_id;

  -- current_participants を更新
  UPDATE schedule_events
  SET current_participants = v_current_participants + p_participant_count
  WHERE id = p_schedule_event_id;

  RETURN v_reservation_id;
END;
$$;

COMMENT ON FUNCTION create_reservation_with_lock IS 
'予約作成（悲観的ロック付き）- reservationsテーブルもFOR UPDATEでロックして競合を防止';

-- update_reservation_with_lock を更新
CREATE OR REPLACE FUNCTION update_reservation_with_lock(
  p_reservation_id UUID,
  p_new_participant_count INTEGER,
  p_customer_id UUID DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_event_id UUID;
  v_old_count INTEGER;
  v_max_participants INTEGER;
  v_current_participants INTEGER;
  v_new_total INTEGER;
  v_org_id UUID;
  v_reservation_customer_id UUID;
  v_reservation_status TEXT;
BEGIN
  -- 予約情報を取得（ロック）
  SELECT schedule_event_id, participant_count, organization_id, customer_id, status
  INTO v_event_id, v_old_count, v_org_id, v_reservation_customer_id, v_reservation_status
  FROM reservations
  WHERE id = p_reservation_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'RESERVATION_NOT_FOUND' USING ERRCODE = 'P0005';
  END IF;

  -- キャンセル済みは変更不可
  IF v_reservation_status = 'cancelled' THEN
    RAISE EXCEPTION 'RESERVATION_CANCELLED' USING ERRCODE = 'P0013';
  END IF;

  -- 権限チェック
  IF p_customer_id IS NOT NULL THEN
    IF v_reservation_customer_id != p_customer_id THEN
      RAISE EXCEPTION 'UNAUTHORIZED' USING ERRCODE = 'P0009';
    END IF;
  ELSE
    IF NOT (
      is_org_admin() OR 
      EXISTS (
        SELECT 1 FROM staff 
        WHERE user_id = auth.uid() 
          AND organization_id = v_org_id 
          AND status = 'active'
      )
    ) THEN
      RAISE EXCEPTION 'UNAUTHORIZED' USING ERRCODE = 'P0009';
    END IF;
  END IF;

  -- イベントをロック
  SELECT COALESCE(max_participants, capacity, 8)
  INTO v_max_participants
  FROM schedule_events
  WHERE id = v_event_id
  FOR UPDATE;

  -- 🔒 現在参加人数を予約テーブルから集計（FOR UPDATE で行ロック）
  SELECT COALESCE(SUM(participant_count), 0)
  INTO v_current_participants
  FROM reservations
  WHERE schedule_event_id = v_event_id
    AND status IN ('pending', 'confirmed', 'gm_confirmed')
  FOR UPDATE;

  -- 変更後の合計を計算
  v_new_total := v_current_participants - v_old_count + p_new_participant_count;

  IF v_new_total > v_max_participants THEN
    RAISE EXCEPTION 'INSUFFICIENT_SEATS' USING ERRCODE = 'P0004';
  END IF;

  -- 予約を更新
  UPDATE reservations
  SET participant_count = p_new_participant_count,
      updated_at = NOW()
  WHERE id = p_reservation_id;

  -- current_participants を更新
  UPDATE schedule_events
  SET current_participants = v_new_total
  WHERE id = v_event_id;

  RETURN TRUE;
END;
$$;

COMMENT ON FUNCTION update_reservation_with_lock IS 
'予約更新（悲観的ロック付き）- reservationsテーブルもFOR UPDATEでロックして競合を防止';

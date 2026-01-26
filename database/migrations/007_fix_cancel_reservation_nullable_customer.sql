-- =============================================================================
-- 予約キャンセルRPC修正: customer_id nullable対応
-- =============================================================================
-- 
-- 問題: cancel_reservation_with_lock が customer_id を必須としているため、
--       スタッフ予約・貸切予約（customer_id = NULL）のキャンセルができない
-- 
-- 修正: customer_id が NULL の場合でも予約IDのみでキャンセル可能にする
-- =============================================================================

CREATE OR REPLACE FUNCTION cancel_reservation_with_lock(
  p_reservation_id UUID,
  p_customer_id UUID DEFAULT NULL,  -- NULL許可に変更
  p_cancellation_reason TEXT DEFAULT NULL
) RETURNS BOOLEAN
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql AS $$
DECLARE
  v_event_id UUID;
  v_count INTEGER;
  v_organization_id UUID;
BEGIN
  -- 予約情報を取得（customer_id がNULLの場合も許可）
  SELECT schedule_event_id, participant_count, organization_id
  INTO v_event_id, v_count, v_organization_id
  FROM reservations
  WHERE id = p_reservation_id
    AND status != 'cancelled'
    AND (
      -- customer_id が指定されている場合は一致チェック
      (p_customer_id IS NOT NULL AND customer_id = p_customer_id)
      -- customer_id が NULL の場合は予約IDのみで判定（スタッフ・貸切予約用）
      OR (p_customer_id IS NULL)
    )
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'RESERVATION_NOT_FOUND' USING ERRCODE = 'P0005';
  END IF;

  -- 在庫返却（schedule_eventsのcurrent_participantsを減算）
  UPDATE schedule_events
  SET current_participants = GREATEST(current_participants - v_count, 0)
  WHERE id = v_event_id;

  -- 予約ステータスを更新
  UPDATE reservations
  SET status = 'cancelled',
      cancelled_at = NOW(),
      cancellation_reason = COALESCE(p_cancellation_reason, cancellation_reason)
  WHERE id = p_reservation_id;

  RETURN TRUE;
END;
$$;

GRANT EXECUTE ON FUNCTION cancel_reservation_with_lock TO authenticated;

-- =============================================================================
-- 参加人数変更RPC修正: customer_id nullable対応
-- =============================================================================

CREATE OR REPLACE FUNCTION update_reservation_participants(
  p_reservation_id UUID,
  p_new_count INTEGER,
  p_customer_id UUID DEFAULT NULL  -- NULL許可に変更
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

  -- 予約情報を取得（customer_id がNULLの場合も許可）
  SELECT schedule_event_id, participant_count
  INTO v_event_id, v_old_count
  FROM reservations
  WHERE id = p_reservation_id
    AND status != 'cancelled'
    AND (
      (p_customer_id IS NOT NULL AND customer_id = p_customer_id)
      OR (p_customer_id IS NULL)
    )
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

  -- 予約の参加人数を更新
  UPDATE reservations
  SET participant_count = p_new_count
  WHERE id = p_reservation_id;

  -- 在庫を調整
  UPDATE schedule_events
  SET current_participants = current_participants + v_diff
  WHERE id = v_event_id;

  RETURN TRUE;
END;
$$;

GRANT EXECUTE ON FUNCTION update_reservation_participants TO authenticated;


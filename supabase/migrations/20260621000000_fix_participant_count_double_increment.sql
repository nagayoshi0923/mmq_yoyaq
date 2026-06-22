-- 参加人数変更RPCの current_participants 二重加算バグ修正
--
-- 背景:
--   update_reservation_participants は末尾で
--     UPDATE schedule_events SET current_participants = current_participants + v_diff
--   を実行していたが、reservations の UPDATE で発火する
--   recalc_current_participants_trigger (recalc_current_participants_for_event)
--   が既に current_participants を「実数合計の絶対値」に再計算している。
--   そのため手動の差分加算は二重カウントになり、
--   変更後にちょうど capacity に達するケースで
--     current_participants(=capacity) + v_diff > capacity
--   となり check 制約 schedule_events_participants_check
--     CHECK (current_participants <= COALESCE(max_participants, capacity))
--   に違反して人数変更が失敗していた（満席ギリギリの公演のみ顕在化）。
--
-- 修正:
--   冗長かつバグの原因である手動の current_participants += v_diff を削除し、
--   在庫の再計算はトリガーに一任する。
--   （関数本体は 20260405110000 の定義から当該ブロックを除いた verbatim 差分）

CREATE OR REPLACE FUNCTION update_reservation_participants(
  p_reservation_id UUID,
  p_new_count INTEGER,
  p_customer_id UUID DEFAULT NULL
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
  v_org_id UUID;
  v_reservation_customer_id UUID;
  v_unit_price INTEGER;
  v_new_total_price INTEGER;
  v_new_final_price INTEGER;
BEGIN
  IF p_new_count <= 0 THEN
    RAISE EXCEPTION 'INVALID_PARTICIPANT_COUNT' USING ERRCODE = 'P0006';
  END IF;

  -- 予約情報を取得
  SELECT schedule_event_id, participant_count, customer_id, organization_id, unit_price
  INTO v_event_id, v_old_count, v_reservation_customer_id, v_org_id, v_unit_price
  FROM reservations
  WHERE id = p_reservation_id
    AND status != 'cancelled'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'RESERVATION_NOT_FOUND' USING ERRCODE = 'P0007';
  END IF;

  -- 🔒 権限チェック
  IF p_customer_id IS NOT NULL THEN
    -- 顧客の場合: 自分の予約のみ変更可能
    IF v_reservation_customer_id != p_customer_id THEN
      RAISE EXCEPTION 'UNAUTHORIZED' USING ERRCODE = 'P0010';
    END IF;
  ELSE
    -- customer_id がNULLの場合: 管理者 or 組織スタッフのみ
    IF NOT (
      is_org_admin() OR
      EXISTS (
        SELECT 1 FROM staff
        WHERE user_id = auth.uid()
          AND organization_id = v_org_id
          AND status = 'active'
      )
    ) THEN
      RAISE EXCEPTION 'UNAUTHORIZED' USING ERRCODE = 'P0011';
    END IF;
  END IF;

  v_diff := p_new_count - v_old_count;

  -- 増加時のみ在庫確認（checked_in を含めて正確な空席数を計算）
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
      AND status IN ('pending', 'confirmed', 'gm_confirmed', 'checked_in');

    IF v_current_participants + v_diff > v_max_participants THEN
      RAISE EXCEPTION 'INSUFFICIENT_SEATS' USING ERRCODE = 'P0008';
    END IF;
  END IF;

  -- 料金を再計算（unit_price × 新人数）
  v_new_total_price := COALESCE(v_unit_price, 0) * p_new_count;
  v_new_final_price := v_new_total_price;

  -- 予約の参加人数と料金を更新
  -- ※ この UPDATE で recalc_current_participants_trigger が発火し、
  --   schedule_events.current_participants を実数合計の絶対値に再計算する。
  --   以前はこの後に current_participants += v_diff を手動実行していたが、
  --   トリガーによる絶対値再計算と二重に加算され、満席ギリギリの公演で
  --   check 制約に違反していたため削除した（在庫の更新はトリガーに一任）。
  UPDATE reservations
  SET participant_count = p_new_count,
      base_price = v_new_total_price,
      total_price = v_new_total_price,
      final_price = v_new_final_price,
      updated_at = NOW()
  WHERE id = p_reservation_id;

  RETURN TRUE;
END;
$$;

GRANT EXECUTE ON FUNCTION update_reservation_participants(UUID, INTEGER, UUID) TO authenticated;

COMMENT ON FUNCTION update_reservation_participants(UUID, INTEGER, UUID) IS
'予約の参加人数を変更。顧客は自分の予約のみ、スタッフは組織内の予約を変更可能。料金も再計算。在庫(current_participants)はトリガーが絶対値で再計算するため当関数内では手動調整しない。';

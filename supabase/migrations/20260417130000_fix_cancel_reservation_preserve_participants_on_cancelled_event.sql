-- =============================================================================
-- 修正: 公演中止済みイベントの予約キャンセル時に current_participants を保持する
-- =============================================================================
--
-- 問題:
--   cancel_reservation_with_lock が予約をキャンセルした後、
--   schedule_events.current_participants をアクティブ予約の合計で上書きする。
--   公演が既に中止 (is_cancelled = TRUE) の場合、アクティブ予約は 0 になるため
--   current_participants が 0 にリセットされてしまう。
--   結果として PerformanceCard に「0/6」と表示される。
--
-- 修正:
--   公演が既に中止済みの場合は current_participants の更新をスキップする。
--   中止前の参加者数（RPC または手動キャンセル時に保存された値）を保持する。
-- =============================================================================

-- シグネチャ 1: (UUID, TEXT) — 2パラメーター版
CREATE OR REPLACE FUNCTION public.cancel_reservation_with_lock(
  p_reservation_id UUID,
  p_cancellation_reason TEXT DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
DECLARE
  v_reservation RECORD;
  v_event_id UUID;
  v_caller_org_id UUID;
  v_actual_participants INTEGER;
  v_event_is_cancelled BOOLEAN;
BEGIN
  -- 予約をロック
  SELECT id, schedule_event_id, status, customer_id, organization_id
  INTO v_reservation
  FROM public.reservations
  WHERE id = p_reservation_id
    AND status != 'cancelled'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'RESERVATION_NOT_FOUND' USING ERRCODE = 'P0005';
  END IF;

  v_event_id := v_reservation.schedule_event_id;

  -- 組織境界チェック（自分の予約か、同組織の admin のみ許可）
  v_caller_org_id := get_user_organization_id();

  IF NOT (
    -- 自分の予約（顧客として）
    EXISTS (
      SELECT 1 FROM public.customers c
      WHERE c.id = v_reservation.customer_id AND c.user_id = auth.uid()
    )
    OR (
      -- 同組織の admin/staff
      is_org_admin()
      AND (v_caller_org_id IS NOT DISTINCT FROM v_reservation.organization_id)
    )
    OR (
      -- スタッフ権限
      EXISTS (
        SELECT 1 FROM staff
        WHERE user_id = auth.uid()
          AND organization_id = v_reservation.organization_id
          AND status = 'active'
      )
    )
  ) THEN
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE = 'P0009';
  END IF;

  -- ステータスを更新
  UPDATE public.reservations
  SET status = 'cancelled',
      cancelled_at = NOW(),
      cancellation_reason = p_cancellation_reason,
      updated_at = NOW()
  WHERE id = p_reservation_id;

  -- 公演の中止状態を確認
  SELECT is_cancelled INTO v_event_is_cancelled
  FROM schedule_events
  WHERE id = v_event_id;

  -- 在庫を再計算（公演が中止済みの場合はスキップ：中止前の人数を保持）
  IF NOT v_event_is_cancelled THEN
    SELECT COALESCE(SUM(participant_count), 0)
    INTO v_actual_participants
    FROM reservations
    WHERE schedule_event_id = v_event_id
      AND status IN ('pending', 'confirmed', 'gm_confirmed');

    UPDATE schedule_events
    SET current_participants = v_actual_participants,
        updated_at = NOW()
    WHERE id = v_event_id;
  END IF;

  RETURN TRUE;
END;
$$;

GRANT EXECUTE ON FUNCTION cancel_reservation_with_lock(UUID, TEXT) TO authenticated;

-- シグネチャ 2: (UUID, UUID, TEXT) — customer_id 指定版
CREATE OR REPLACE FUNCTION public.cancel_reservation_with_lock(
  p_reservation_id UUID,
  p_customer_id UUID,
  p_cancellation_reason TEXT DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
DECLARE
  v_reservation RECORD;
  v_event_id UUID;
  v_caller_org_id UUID;
  v_actual_participants INTEGER;
  v_event_is_cancelled BOOLEAN;
BEGIN
  -- 予約をロック
  SELECT id, schedule_event_id, status, customer_id, organization_id
  INTO v_reservation
  FROM public.reservations
  WHERE id = p_reservation_id
    AND status != 'cancelled'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'RESERVATION_NOT_FOUND' USING ERRCODE = 'P0005';
  END IF;

  v_event_id := v_reservation.schedule_event_id;

  -- 組織境界チェック
  v_caller_org_id := get_user_organization_id();

  IF NOT (
    -- 自分の予約（顧客として — customer_id で照合）
    EXISTS (
      SELECT 1 FROM public.customers c
      WHERE c.id = COALESCE(p_customer_id, v_reservation.customer_id)
        AND c.user_id = auth.uid()
    )
    OR (
      -- 同組織の admin
      is_org_admin()
      AND (v_caller_org_id IS NOT DISTINCT FROM v_reservation.organization_id)
    )
    OR (
      -- スタッフ権限
      EXISTS (
        SELECT 1 FROM staff
        WHERE user_id = auth.uid()
          AND organization_id = v_reservation.organization_id
          AND status = 'active'
      )
    )
  ) THEN
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE = 'P0009';
  END IF;

  -- ステータスを更新
  UPDATE public.reservations
  SET status = 'cancelled',
      cancelled_at = NOW(),
      cancellation_reason = p_cancellation_reason,
      updated_at = NOW()
  WHERE id = p_reservation_id;

  -- 公演の中止状態を確認
  SELECT is_cancelled INTO v_event_is_cancelled
  FROM schedule_events
  WHERE id = v_event_id;

  -- 在庫を再計算（公演が中止済みの場合はスキップ：中止前の人数を保持）
  IF NOT v_event_is_cancelled THEN
    SELECT COALESCE(SUM(participant_count), 0)
    INTO v_actual_participants
    FROM reservations
    WHERE schedule_event_id = v_event_id
      AND status IN ('pending', 'confirmed', 'gm_confirmed');

    UPDATE schedule_events
    SET current_participants = v_actual_participants,
        updated_at = NOW()
    WHERE id = v_event_id;
  END IF;

  RETURN TRUE;
END;
$$;

GRANT EXECUTE ON FUNCTION cancel_reservation_with_lock(UUID, UUID, TEXT) TO authenticated;

COMMENT ON FUNCTION cancel_reservation_with_lock(UUID, TEXT) IS
'予約をキャンセル（2パラメーター版）。公演が中止済みの場合は current_participants を更新しない（中止前の人数を保持）。';

COMMENT ON FUNCTION cancel_reservation_with_lock(UUID, UUID, TEXT) IS
'予約をキャンセル（3パラメーター版）。公演が中止済みの場合は current_participants を更新しない（中止前の人数を保持）。';

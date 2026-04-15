-- =============================================================================
-- cancel_reservation_and_group_with_lock
-- 通常キャンセル専用: 予約キャンセル + 貸切グループのキャンセルを1トランザクションで実行
--
-- 却下フロー（mark_private_group_rejected_after_booking_rejection）は
-- 既存の cancel_reservation_with_lock を引き続き使用するため、このRPCは呼ばない。
-- =============================================================================

CREATE OR REPLACE FUNCTION public.cancel_reservation_and_group_with_lock(
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
BEGIN
  -- 予約をロック（cancel_reservation_with_lock と同じ認可チェック）
  SELECT id, schedule_event_id, status, customer_id, organization_id, private_group_id
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

  -- 予約ステータスを更新
  UPDATE public.reservations
  SET status = 'cancelled',
      cancelled_at = NOW(),
      cancellation_reason = p_cancellation_reason,
      updated_at = NOW()
  WHERE id = p_reservation_id;

  -- 在庫を再計算（絶対値で再集計）
  SELECT COALESCE(SUM(participant_count), 0)
  INTO v_actual_participants
  FROM reservations
  WHERE schedule_event_id = v_event_id
    AND status IN ('pending', 'confirmed', 'gm_confirmed');

  UPDATE schedule_events
  SET current_participants = v_actual_participants,
      updated_at = NOW()
  WHERE id = v_event_id;

  -- 貸切グループが紐づいている場合、同一トランザクションでキャンセル
  IF v_reservation.private_group_id IS NOT NULL THEN
    UPDATE public.private_groups
    SET status = 'cancelled',
        updated_at = NOW()
    WHERE id = v_reservation.private_group_id
      AND status != 'cancelled';
  END IF;

  RETURN TRUE;
END;
$$;

GRANT EXECUTE ON FUNCTION public.cancel_reservation_and_group_with_lock(UUID, UUID, TEXT) TO authenticated;

COMMENT ON FUNCTION public.cancel_reservation_and_group_with_lock(UUID, UUID, TEXT) IS
'通常キャンセル専用。予約キャンセル・在庫返却・貸切グループのキャンセルを1トランザクションで実行。
却下フロー（mark_private_group_rejected_after_booking_rejection）では使用しないこと。';

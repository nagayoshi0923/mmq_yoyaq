-- DEPLOY ロールバック（問題が発生した場合のみ）
--
-- 対象:
-- - 007_fix_cancel_reservation_nullable_customer.sql のロールバック（例: customer_id NOT NULL 相当に戻す）
-- - 008_waitlist_notification_retry_queue.sql のロールバック（キュー削除）
--
-- 注意:
-- - 既存データ/運用に影響します。必ず影響範囲を理解して実施してください。

-- 007のロールバック: RPC関数を元に戻す
CREATE OR REPLACE FUNCTION cancel_reservation_with_lock(
  p_reservation_id UUID,
  p_customer_id UUID,  -- NOT NULL に戻す
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
    AND customer_id = p_customer_id  -- 必須に戻す
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

-- 008のロールバック: リトライキューテーブル削除
DROP TABLE IF EXISTS waitlist_notification_queue CASCADE;


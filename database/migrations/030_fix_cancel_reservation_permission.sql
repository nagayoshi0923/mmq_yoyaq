-- =============================================================================
-- マイグレーション 030: 予約キャンセルの権限チェック修正
-- =============================================================================
-- 
-- 作成日: 2026-02-01
-- 
-- 問題:
--   p_customer_id = NULL で呼ぶと誰でも任意の予約をキャンセル可能だった
--   （013で update_reservation_participants は修正されたが、cancel は未修正）
-- 
-- 修正:
--   p_customer_id = NULL の場合は組織スタッフ権限をチェック
-- 
-- =============================================================================

CREATE OR REPLACE FUNCTION cancel_reservation_with_lock(
  p_reservation_id UUID,
  p_customer_id UUID DEFAULT NULL,
  p_cancellation_reason TEXT DEFAULT NULL
) RETURNS BOOLEAN
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql AS $$
DECLARE
  v_event_id UUID;
  v_count INTEGER;
  v_organization_id UUID;
  v_reservation_customer_id UUID;
  v_actual_participants INTEGER;
BEGIN
  -- 予約情報を取得（FOR UPDATEでロック）
  SELECT schedule_event_id, participant_count, organization_id, customer_id
  INTO v_event_id, v_count, v_organization_id, v_reservation_customer_id
  FROM reservations
  WHERE id = p_reservation_id
    AND status != 'cancelled'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'RESERVATION_NOT_FOUND' USING ERRCODE = 'P0005';
  END IF;

  -- 🔒 権限チェック（013と同様のパターン）
  IF p_customer_id IS NOT NULL THEN
    -- 顧客の場合: 自分の予約のみキャンセル可能
    IF v_reservation_customer_id IS NULL OR v_reservation_customer_id != p_customer_id THEN
      RAISE EXCEPTION 'UNAUTHORIZED' USING ERRCODE = 'P0009';
    END IF;
  ELSE
    -- customer_id がNULLの場合: 管理者 or 組織スタッフのみ
    IF NOT (
      is_org_admin() OR 
      EXISTS (
        SELECT 1 FROM staff 
        WHERE user_id = auth.uid() 
          AND organization_id = v_organization_id 
          AND status = 'active'
      )
    ) THEN
      RAISE EXCEPTION 'UNAUTHORIZED' USING ERRCODE = 'P0009';
    END IF;
  END IF;

  -- 予約ステータスを更新
  UPDATE reservations
  SET status = 'cancelled',
      cancelled_at = NOW(),
      cancellation_reason = COALESCE(p_cancellation_reason, cancellation_reason),
      updated_at = NOW()
  WHERE id = p_reservation_id;

  -- 在庫を再計算（相対減算ではなく、絶対値で再集計）
  SELECT COALESCE(SUM(participant_count), 0)
  INTO v_actual_participants
  FROM reservations
  WHERE schedule_event_id = v_event_id
    AND status IN ('pending', 'confirmed', 'gm_confirmed');

  UPDATE schedule_events
  SET current_participants = v_actual_participants,
      updated_at = NOW()
  WHERE id = v_event_id;

  RETURN TRUE;
END;
$$;

COMMENT ON FUNCTION cancel_reservation_with_lock(UUID, UUID, TEXT) IS 
'予約をキャンセル。顧客は自分の予約のみ、スタッフは組織内の予約をキャンセル可能。在庫は絶対値で再計算。';

GRANT EXECUTE ON FUNCTION cancel_reservation_with_lock TO authenticated;

-- 完了確認
DO $$ 
BEGIN
  RAISE NOTICE '✅ マイグレーション 030 完了: 予約キャンセルの権限チェックを修正';
END $$;

-- =============================================================================
-- ロールバックSQL（必要な場合のみ実行）
-- =============================================================================
/*
-- 007の実装に戻す
CREATE OR REPLACE FUNCTION cancel_reservation_with_lock(
  p_reservation_id UUID,
  p_customer_id UUID DEFAULT NULL,
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
  SELECT schedule_event_id, participant_count, organization_id
  INTO v_event_id, v_count, v_organization_id
  FROM reservations
  WHERE id = p_reservation_id
    AND status != 'cancelled'
    AND (
      (p_customer_id IS NOT NULL AND customer_id = p_customer_id)
      OR (p_customer_id IS NULL)
    )
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
*/

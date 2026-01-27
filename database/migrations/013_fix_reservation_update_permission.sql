-- =============================================================================
-- マイグレーション 013: 予約人数変更の権限チェック修正
-- =============================================================================
-- 
-- 作成日: 2026-01-28
-- 
-- 問題:
--   p_customer_id = NULL で呼ぶと誰でも任意の予約を変更可能だった
-- 
-- 修正:
--   p_customer_id = NULL の場合は組織スタッフ権限をチェック
-- 
-- =============================================================================

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
BEGIN
  IF p_new_count <= 0 THEN
    RAISE EXCEPTION 'INVALID_PARTICIPANT_COUNT' USING ERRCODE = 'P0006';
  END IF;

  -- 予約情報を取得
  SELECT schedule_event_id, participant_count, customer_id, organization_id
  INTO v_event_id, v_old_count, v_reservation_customer_id, v_org_id
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
      RAISE EXCEPTION 'UNAUTHORIZED' USING ERRCODE = 'P0009';
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
      RAISE EXCEPTION 'UNAUTHORIZED' USING ERRCODE = 'P0009';
    END IF;
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
  SET participant_count = p_new_count,
      updated_at = NOW()
  WHERE id = p_reservation_id;

  -- 在庫を調整
  UPDATE schedule_events
  SET current_participants = current_participants + v_diff,
      updated_at = NOW()
  WHERE id = v_event_id;

  RETURN TRUE;
END;
$$;

COMMENT ON FUNCTION update_reservation_participants(UUID, INTEGER, UUID) IS 
'予約の参加人数を変更。顧客は自分の予約のみ、スタッフは組織内の予約を変更可能。';

-- 完了確認
DO $$ 
BEGIN
  RAISE NOTICE '✅ マイグレーション 013 完了: 予約人数変更の権限チェックを修正';
END $$;

-- =============================================================================
-- ロールバックSQL（必要な場合のみ実行）
-- =============================================================================
/*
-- 007の実装に戻す
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
BEGIN
  IF p_new_count <= 0 THEN
    RAISE EXCEPTION 'INVALID_PARTICIPANT_COUNT' USING ERRCODE = 'P0006';
  END IF;

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
*/


-- =============================================================================
-- マイグレーション 027: 日程変更RPC追加（在庫整合性保証）
-- =============================================================================
-- 
-- 作成日: 2026-01-30
-- 
-- 🚨 問題:
--   日程変更が直接UPDATE（在庫ロックなし）で実装されており、
--   旧イベント/新イベント両方で在庫が不整合になる可能性があった
-- 
-- ✅ 対策:
--   change_reservation_schedule RPC 関数を追加し、在庫をアトミックに調整
-- 
-- =============================================================================

CREATE OR REPLACE FUNCTION change_reservation_schedule(
  p_reservation_id UUID,
  p_new_schedule_event_id UUID,
  p_customer_id UUID
) RETURNS BOOLEAN
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql AS $$
DECLARE
  v_old_event_id UUID;
  v_participant_count INTEGER;
  v_new_max_participants INTEGER;
  v_new_current_participants INTEGER;
  v_org_id UUID;
  v_reservation_customer_id UUID;
  v_new_store_id UUID;
  v_new_date DATE;
  v_new_start_time TIME;
BEGIN
  -- 🔒 既存予約をロック
  SELECT schedule_event_id, participant_count, organization_id, customer_id
  INTO v_old_event_id, v_participant_count, v_org_id, v_reservation_customer_id
  FROM reservations
  WHERE id = p_reservation_id
    AND status != 'cancelled'
  FOR UPDATE;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'RESERVATION_NOT_FOUND' USING ERRCODE = 'P0007';
  END IF;
  
  -- 権限確認
  IF v_reservation_customer_id IS DISTINCT FROM p_customer_id THEN
    RAISE EXCEPTION 'UNAUTHORIZED' USING ERRCODE = 'P0010';
  END IF;
  
  -- 同じイベントへの変更は無視
  IF v_old_event_id = p_new_schedule_event_id THEN
    RETURN TRUE;
  END IF;
  
  -- 🔒 新旧両方のイベントをロック（デッドロック回避のためID順）
  IF v_old_event_id < p_new_schedule_event_id THEN
    PERFORM 1 FROM schedule_events WHERE id = v_old_event_id FOR UPDATE;
    PERFORM 1 FROM schedule_events WHERE id = p_new_schedule_event_id FOR UPDATE;
  ELSE
    PERFORM 1 FROM schedule_events WHERE id = p_new_schedule_event_id FOR UPDATE;
    PERFORM 1 FROM schedule_events WHERE id = v_old_event_id FOR UPDATE;
  END IF;
  
  -- 新イベントの情報と空席確認
  SELECT 
    COALESCE(max_participants, capacity, 8), 
    current_participants,
    store_id,
    date,
    start_time,
    is_cancelled
  INTO 
    v_new_max_participants, 
    v_new_current_participants,
    v_new_store_id,
    v_new_date,
    v_new_start_time
  FROM schedule_events
  WHERE id = p_new_schedule_event_id
    AND organization_id = v_org_id;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'NEW_EVENT_NOT_FOUND' USING ERRCODE = 'P0020';
  END IF;
  
  IF (v_new_current_participants + v_participant_count) > v_new_max_participants THEN
    RAISE EXCEPTION 'INSUFFICIENT_SEATS_IN_NEW_EVENT' USING ERRCODE = 'P0021';
  END IF;
  
  -- ✅ 旧イベントから在庫を返却
  UPDATE schedule_events
  SET current_participants = GREATEST(current_participants - v_participant_count, 0)
  WHERE id = v_old_event_id;
  
  -- ✅ 新イベントで在庫を確保
  UPDATE schedule_events
  SET current_participants = current_participants + v_participant_count
  WHERE id = p_new_schedule_event_id;
  
  -- ✅ 予約を更新
  UPDATE reservations
  SET 
    schedule_event_id = p_new_schedule_event_id,
    store_id = v_new_store_id,
    requested_datetime = (v_new_date + v_new_start_time)::TIMESTAMPTZ,
    updated_at = NOW()
  WHERE id = p_reservation_id;
  
  RETURN TRUE;
END;
$$;

GRANT EXECUTE ON FUNCTION change_reservation_schedule TO authenticated;

COMMENT ON FUNCTION change_reservation_schedule IS 
'予約の日程を変更（在庫をアトミックに調整）。旧イベントから在庫返却、新イベントで在庫確保を原子的に実行。';

-- 完了確認
DO $$ 
BEGIN
  RAISE NOTICE '✅ マイグレーション 027 完了';
  RAISE NOTICE '  - change_reservation_schedule RPC 関数を追加';
  RAISE NOTICE '  - 日程変更時の在庫整合性を保証';
END $$;

-- =============================================================================
-- ロールバックSQL
-- =============================================================================
/*
DROP FUNCTION IF EXISTS change_reservation_schedule(UUID, UUID, UUID);
*/

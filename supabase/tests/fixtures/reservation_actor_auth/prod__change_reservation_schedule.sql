CREATE OR REPLACE FUNCTION public.change_reservation_schedule(p_reservation_id uuid, p_new_schedule_event_id uuid, p_customer_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  v_auth_customer_id UUID;
  v_is_cancelled BOOLEAN;
BEGIN
  -- 🔒 認証ユーザーのcustomer_idを取得
  SELECT id INTO v_auth_customer_id
  FROM customers
  WHERE user_id = auth.uid();
  
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
  
  -- 🔒 権限確認（本人 or スタッフ/管理者）
  IF v_reservation_customer_id IS DISTINCT FROM v_auth_customer_id 
     AND NOT is_org_admin() 
     AND NOT is_org_admin() THEN
    RAISE EXCEPTION 'UNAUTHORIZED: 予約の変更権限がありません' USING ERRCODE = 'P0010';
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
    v_new_start_time,
    v_is_cancelled
  FROM schedule_events
  WHERE id = p_new_schedule_event_id
    AND organization_id = v_org_id;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'NEW_EVENT_NOT_FOUND: 新しい公演が見つかりません' USING ERRCODE = 'P0020';
  END IF;
  
  IF v_is_cancelled THEN
    RAISE EXCEPTION 'EVENT_CANCELLED: この公演はキャンセルされています' USING ERRCODE = 'P0022';
  END IF;
  
  IF (v_new_current_participants + v_participant_count) > v_new_max_participants THEN
    RAISE EXCEPTION 'INSUFFICIENT_SEATS_IN_NEW_EVENT: 新しい公演の空席が不足しています' USING ERRCODE = 'P0021';
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
$function$

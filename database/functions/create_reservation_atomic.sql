-- アトミックな予約作成関数
-- 同時予約時の競合を防ぐため、トランザクション内でチェックと挿入を行う

CREATE OR REPLACE FUNCTION create_reservation_atomic(
  p_schedule_event_id UUID,
  p_participant_count INTEGER,
  p_customer_id UUID,
  p_customer_name TEXT,
  p_customer_email TEXT,
  p_customer_phone TEXT,
  p_scenario_id UUID,
  p_store_id UUID,
  p_requested_datetime TIMESTAMP WITH TIME ZONE,
  p_duration INTEGER,
  p_base_price INTEGER,
  p_total_price INTEGER,
  p_unit_price INTEGER,
  p_reservation_number TEXT,
  p_notes TEXT,
  p_created_by UUID,
  p_organization_id UUID,
  p_scenario_title TEXT DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_max_participants INTEGER;
  v_current_participants INTEGER;
  v_available_seats INTEGER;
  v_reservation_id UUID;
  v_result JSONB;
BEGIN
  -- 1. 公演の最大参加人数を取得（ロック付き）
  SELECT COALESCE(max_participants, capacity, 8)
  INTO v_max_participants
  FROM schedule_events
  WHERE id = p_schedule_event_id
  FOR UPDATE;  -- 行レベルロック
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', '公演が見つかりません'
    );
  END IF;
  
  -- 2. 現在の参加者数を予約テーブルから集計
  SELECT COALESCE(SUM(participant_count), 0)
  INTO v_current_participants
  FROM reservations
  WHERE schedule_event_id = p_schedule_event_id
    AND status IN ('pending', 'confirmed', 'gm_confirmed');
  
  -- 3. 空席チェック
  v_available_seats := v_max_participants - v_current_participants;
  
  IF v_available_seats <= 0 THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'この公演は満席です'
    );
  END IF;
  
  IF p_participant_count > v_available_seats THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', format('残り%s名分の空きしかありません', v_available_seats)
    );
  END IF;
  
  -- 4. 予約を作成
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
    participant_names,
    base_price,
    options_price,
    total_price,
    discount_amount,
    final_price,
    unit_price,
    payment_method,
    payment_status,
    status,
    customer_notes,
    reservation_number,
    created_by,
    organization_id,
    title
  ) VALUES (
    p_schedule_event_id,
    p_scenario_id,
    p_store_id,
    p_customer_id,
    p_customer_name,
    p_customer_email,
    p_customer_phone,
    p_requested_datetime,
    p_duration,
    p_participant_count,
    ARRAY[]::text[],
    p_base_price,
    0,
    p_total_price,
    0,
    p_total_price,
    p_unit_price,
    'onsite',
    'pending',
    'confirmed',
    p_notes,
    p_reservation_number,
    p_created_by,
    p_organization_id,
    COALESCE(p_scenario_title, '')
  )
  RETURNING id INTO v_reservation_id;
  
  -- 5. schedule_eventsのcurrent_participantsを更新
  UPDATE schedule_events
  SET current_participants = v_current_participants + p_participant_count
  WHERE id = p_schedule_event_id;
  
  -- 6. 成功レスポンス
  RETURN jsonb_build_object(
    'success', true,
    'reservation_id', v_reservation_id,
    'reservation_number', p_reservation_number
  );
  
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', SQLERRM
    );
END;
$$;

-- コメント
COMMENT ON FUNCTION create_reservation_atomic IS 'アトミックな予約作成関数。同時予約時の競合を防ぐため、トランザクション内でチェックと挿入を行う。';

-- 権限設定（認証済みユーザーが呼び出せる）
GRANT EXECUTE ON FUNCTION create_reservation_atomic TO authenticated;


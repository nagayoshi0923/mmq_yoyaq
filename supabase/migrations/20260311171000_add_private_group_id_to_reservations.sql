-- =============================================================================
-- 20260311170000: reservationsテーブルにprivate_group_idカラムを追加
-- =============================================================================
--
-- 背景:
-- - 貸切グループ機能で、予約とグループを紐付ける必要がある
-- - 予約が確定したときにグループのステータスも更新するため
--
-- =============================================================================

-- private_group_id カラムを追加
ALTER TABLE reservations 
ADD COLUMN IF NOT EXISTS private_group_id UUID REFERENCES private_groups(id) ON DELETE SET NULL;

-- インデックスを追加
CREATE INDEX IF NOT EXISTS idx_reservations_private_group_id 
ON reservations(private_group_id) 
WHERE private_group_id IS NOT NULL;

COMMENT ON COLUMN reservations.private_group_id IS '貸切グループID（グループから申請された場合のみ設定）';

-- create_private_booking_request RPC を更新して private_group_id を受け取れるようにする
CREATE OR REPLACE FUNCTION create_private_booking_request(
  p_scenario_id UUID,
  p_customer_id UUID,
  p_customer_name TEXT,
  p_customer_email TEXT,
  p_customer_phone TEXT,
  p_participant_count INTEGER,
  p_candidate_datetimes JSONB,
  p_notes TEXT DEFAULT NULL,
  p_reservation_number TEXT DEFAULT NULL,
  p_private_group_id UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_reservation_id UUID;
  v_org_id UUID;
  v_scenario_title TEXT;
  v_scenario_master_id UUID;
  v_base_price INTEGER;
  v_participation_fee INTEGER;
  v_total_price INTEGER;
  v_existing_id UUID;
  v_gm_id UUID;
BEGIN
  -- 冪等性チェック（同じ予約番号が既に存在する場合はそのIDを返す）
  IF p_reservation_number IS NOT NULL THEN
    SELECT id INTO v_existing_id
    FROM reservations
    WHERE reservation_number = p_reservation_number;
    
    IF v_existing_id IS NOT NULL THEN
      RETURN v_existing_id;
    END IF;
  END IF;

  -- 入力検証
  IF p_customer_name IS NULL OR p_customer_name = '' THEN
    RAISE EXCEPTION 'Customer name is required' USING ERRCODE = 'P0020';
  END IF;
  
  IF p_customer_email IS NULL OR p_customer_email = '' THEN
    RAISE EXCEPTION 'Customer email is required' USING ERRCODE = 'P0021';
  END IF;
  
  IF p_customer_phone IS NULL OR p_customer_phone = '' THEN
    RAISE EXCEPTION 'Customer phone is required' USING ERRCODE = 'P0022';
  END IF;
  
  IF p_candidate_datetimes IS NULL OR jsonb_array_length(p_candidate_datetimes->'candidates') = 0 THEN
    RAISE EXCEPTION 'Candidate datetimes are required' USING ERRCODE = 'P0023';
  END IF;

  -- シナリオ情報を取得（組織ID、料金情報を含む）
  SELECT 
    sm.id,
    sm.title,
    COALESCE(os.organization_id, 
      (SELECT organization_id FROM organization_scenarios WHERE scenario_master_id = sm.id LIMIT 1)
    ),
    COALESCE(sm.base_price, 0),
    COALESCE(sm.participation_fee, 0)
  INTO v_scenario_master_id, v_scenario_title, v_org_id, v_base_price, v_participation_fee
  FROM scenario_masters sm
  LEFT JOIN organization_scenarios os ON os.scenario_master_id = sm.id
  WHERE sm.id = p_scenario_id
  LIMIT 1;
  
  IF v_scenario_master_id IS NULL THEN
    RAISE EXCEPTION 'Scenario not found' USING ERRCODE = 'P0024';
  END IF;

  -- 参加人数の上限チェック
  IF p_participant_count > 10 THEN
    RAISE EXCEPTION 'Participant count exceeds maximum' USING ERRCODE = 'P0025';
  END IF;

  -- 料金計算（参加人数 × 参加費）
  v_total_price := p_participant_count * v_participation_fee;

  -- 予約を作成
  INSERT INTO reservations (
    customer_id,
    scenario_id,
    scenario_master_id,
    scenario_title,
    organization_id,
    customer_name,
    customer_email,
    customer_phone,
    participant_count,
    candidate_datetimes,
    customer_notes,
    status,
    reservation_number,
    total_price,
    reservation_type,
    private_group_id
  ) VALUES (
    p_customer_id,
    p_scenario_id,
    v_scenario_master_id,
    v_scenario_title,
    v_org_id,
    p_customer_name,
    p_customer_email,
    p_customer_phone,
    p_participant_count,
    p_candidate_datetimes,
    p_notes,
    'pending',
    COALESCE(p_reservation_number, 'PB-' || to_char(NOW(), 'YYYYMMDD') || '-' || substr(gen_random_uuid()::text, 1, 8)),
    v_total_price,
    'private',
    p_private_group_id
  )
  RETURNING id INTO v_reservation_id;

  -- GM確認リクエストを作成（シナリオに担当可能なGMがいる場合）
  FOR v_gm_id IN
    SELECT staff_id
    FROM staff_scenario_assignments
    WHERE scenario_master_id = v_scenario_master_id
      AND can_gm = true
  LOOP
    INSERT INTO gm_availability_responses (
      reservation_id,
      staff_id,
      response_status,
      available_candidates,
      created_at
    ) VALUES (
      v_reservation_id,
      v_gm_id,
      'pending',
      NULL,
      NOW()
    )
    ON CONFLICT (reservation_id, staff_id) DO NOTHING;
  END LOOP;

  RETURN v_reservation_id;
END;
$$;

GRANT EXECUTE ON FUNCTION create_private_booking_request(UUID, UUID, TEXT, TEXT, TEXT, INTEGER, JSONB, TEXT, TEXT, UUID) TO authenticated;

COMMENT ON FUNCTION create_private_booking_request(UUID, UUID, TEXT, TEXT, TEXT, INTEGER, JSONB, TEXT, TEXT, UUID) IS 
'貸切予約リクエストを作成。private_group_idでグループとの紐付けをサポート。';


-- approve_private_booking RPC を更新してグループステータスも更新するようにする
CREATE OR REPLACE FUNCTION approve_private_booking(
  p_reservation_id UUID,
  p_selected_date DATE,
  p_selected_start_time TIME,
  p_selected_end_time TIME,
  p_selected_store_id UUID,
  p_selected_gm_id UUID,
  p_candidate_datetimes JSONB,
  p_scenario_title TEXT,
  p_customer_name TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
DECLARE
  v_reservation RECORD;
  v_org_id UUID;
  v_caller_org_id UUID;
  v_schedule_event_id UUID;
  v_gm_name TEXT;
  v_store_name TEXT;
  v_updated_count INTEGER;
  v_private_group_id UUID;
BEGIN
  -- 予約をロックして取得
  SELECT *
  INTO v_reservation
  FROM reservations
  WHERE id = p_reservation_id
    AND status IN ('pending', 'gm_confirmed')
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'RESERVATION_NOT_FOUND_OR_ALREADY_CONFIRMED' USING ERRCODE = 'P0018';
  END IF;

  v_org_id := v_reservation.organization_id;
  v_private_group_id := v_reservation.private_group_id;

  -- 権限（スタッフ/管理者のみ）
  v_caller_org_id := get_user_organization_id();
  IF NOT (is_org_admin() OR (v_caller_org_id IS NOT NULL AND v_caller_org_id = v_org_id)) THEN
    RAISE EXCEPTION 'UNAUTHORIZED' USING ERRCODE = 'P0010';
  END IF;

  -- 店舗/GM名を取得（組織一致）
  SELECT name INTO v_gm_name
  FROM staff
  WHERE id = p_selected_gm_id
    AND organization_id = v_org_id;

  IF v_gm_name IS NULL THEN
    RAISE EXCEPTION 'GM_NOT_FOUND' USING ERRCODE = 'P0019';
  END IF;

  SELECT name INTO v_store_name
  FROM stores
  WHERE id = p_selected_store_id
    AND organization_id = v_org_id;

  IF v_store_name IS NULL THEN
    RAISE EXCEPTION 'STORE_NOT_FOUND' USING ERRCODE = 'P0020';
  END IF;

  -- 店舗の同日・同時間帯の重複チェック
  IF EXISTS (
    SELECT 1
    FROM schedule_events
    WHERE store_id = p_selected_store_id
      AND date = p_selected_date
      AND start_time < p_selected_end_time
      AND end_time > p_selected_start_time
  ) THEN
    RAISE EXCEPTION 'STORE_SLOT_CONFLICT' USING ERRCODE = 'P0021';
  END IF;

  -- GMの同日・同時間帯の重複チェック（schedule_events.gms配列にGM名が含まれているか）
  IF EXISTS (
    SELECT 1
    FROM schedule_events
    WHERE date = p_selected_date
      AND start_time < p_selected_end_time
      AND end_time > p_selected_start_time
      AND v_gm_name = ANY(gms)
  ) THEN
    RAISE EXCEPTION 'GM_SCHEDULE_CONFLICT: The selected GM already has another event at this time' USING ERRCODE = 'P0025';
  END IF;

  -- schedule_event を作成
  INSERT INTO schedule_events (
    organization_id,
    store_id,
    date,
    start_time,
    end_time,
    scenario_master_id,
    title,
    event_type,
    gms,
    reservation_id,
    participant_count,
    current_participants
  ) VALUES (
    v_org_id,
    p_selected_store_id,
    p_selected_date,
    p_selected_start_time,
    p_selected_end_time,
    v_reservation.scenario_master_id,
    COALESCE(p_scenario_title, v_reservation.scenario_title) || '（' || COALESCE(p_customer_name, v_reservation.customer_name) || '様貸切）',
    'private',
    ARRAY[v_gm_name],
    p_reservation_id,
    v_reservation.participant_count,
    v_reservation.participant_count
  )
  RETURNING id INTO v_schedule_event_id;

  -- reservation を更新
  UPDATE reservations
  SET
    status = 'confirmed',
    store_id = p_selected_store_id,
    gm_staff = p_selected_gm_id,
    requested_datetime = (p_selected_date || ' ' || p_selected_start_time)::TIMESTAMP WITH TIME ZONE,
    event_datetime = (p_selected_date || ' ' || p_selected_start_time)::TIMESTAMP WITH TIME ZONE,
    duration = EXTRACT(EPOCH FROM (p_selected_end_time - p_selected_start_time)) / 60,
    candidate_datetimes = p_candidate_datetimes,
    schedule_event_id = v_schedule_event_id,
    confirmed_at = NOW()
  WHERE id = p_reservation_id;

  GET DIAGNOSTICS v_updated_count = ROW_COUNT;
  IF v_updated_count = 0 THEN
    RAISE EXCEPTION 'RESERVATION_UPDATE_FAILED: RLS may have blocked the update' USING ERRCODE = 'P0026';
  END IF;

  -- 紐付いたグループがある場合、ステータスを confirmed に更新
  IF v_private_group_id IS NOT NULL THEN
    UPDATE private_groups
    SET status = 'confirmed'
    WHERE id = v_private_group_id;
  END IF;

  RETURN v_schedule_event_id;
END;
$$;

GRANT EXECUTE ON FUNCTION approve_private_booking TO authenticated;

COMMENT ON FUNCTION approve_private_booking IS
'貸切予約承認をアトミックに実行。紐付いたprivate_groupsのステータスも自動でconfirmedに更新。';

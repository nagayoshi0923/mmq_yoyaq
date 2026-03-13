-- =============================================================================
-- 20260313110000: gm_availability_responses の organization_id を設定
-- =============================================================================
-- 問題: GM確認リクエスト作成時に organization_id が NULL
-- 修正: v_org_id を INSERT に追加
-- =============================================================================

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
  v_participation_fee INTEGER;
  v_total_price INTEGER;
  v_existing_id UUID;
  v_gm_id UUID;
  v_duration INTEGER;
  v_first_candidate JSONB;
  v_requested_datetime TIMESTAMPTZ;
BEGIN
  -- 冪等性チェック
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

  -- シナリオ情報を取得
  SELECT 
    s.id,
    s.title,
    s.organization_id,
    COALESCE(s.duration, 180),
    COALESCE(os.participation_fee, 0)
  INTO v_scenario_master_id, v_scenario_title, v_org_id, v_duration, v_participation_fee
  FROM scenarios s
  LEFT JOIN organization_scenarios os ON os.scenario_master_id = COALESCE(s.scenario_master_id, s.id)
  WHERE s.id = p_scenario_id
  LIMIT 1;
  
  -- scenarios で見つからない場合は scenario_masters を確認
  IF v_scenario_master_id IS NULL THEN
    SELECT 
      sm.id,
      sm.title,
      os.organization_id,
      COALESCE(sm.official_duration, 180),
      COALESCE(os.participation_fee, 0)
    INTO v_scenario_master_id, v_scenario_title, v_org_id, v_duration, v_participation_fee
    FROM scenario_masters sm
    LEFT JOIN organization_scenarios os ON os.scenario_master_id = sm.id
    WHERE sm.id = p_scenario_id
    LIMIT 1;
  END IF;
  
  IF v_scenario_master_id IS NULL THEN
    RAISE EXCEPTION 'Scenario not found' USING ERRCODE = 'P0024';
  END IF;
  
  -- organization_id が取得できなかった場合のフォールバック
  IF v_org_id IS NULL THEN
    -- organization_scenarios から直接取得を試みる
    SELECT os.organization_id INTO v_org_id
    FROM organization_scenarios os
    WHERE os.scenario_master_id = p_scenario_id
       OR os.scenario_master_id = v_scenario_master_id
    LIMIT 1;
  END IF;
  
  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'Organization not found for scenario' USING ERRCODE = 'P0026';
  END IF;

  -- 参加人数の上限チェック
  IF p_participant_count > 10 THEN
    RAISE EXCEPTION 'Participant count exceeds maximum' USING ERRCODE = 'P0025';
  END IF;

  -- 料金計算
  v_total_price := p_participant_count * v_participation_fee;

  -- 最初の候補日時を取得
  v_first_candidate := p_candidate_datetimes->'candidates'->0;
  v_requested_datetime := (
    (v_first_candidate->>'date') || 'T' || 
    COALESCE(v_first_candidate->>'startTime', '10:00') || 
    '+09:00'
  )::TIMESTAMPTZ;

  -- 予約を作成
  INSERT INTO reservations (
    title,
    reservation_number,
    scenario_id,
    customer_id,
    requested_datetime,
    duration,
    participant_count,
    total_price,
    status,
    customer_notes,
    organization_id,
    customer_name,
    customer_email,
    customer_phone,
    candidate_datetimes,
    priority,
    reservation_type,
    private_group_id
  ) VALUES (
    '【貸切希望】' || v_scenario_title,
    COALESCE(p_reservation_number, 'PB-' || to_char(NOW(), 'YYYYMMDD') || '-' || substr(gen_random_uuid()::text, 1, 8)),
    p_scenario_id,
    p_customer_id,
    v_requested_datetime,
    v_duration,
    p_participant_count,
    v_total_price,
    'pending',
    p_notes,
    v_org_id,
    p_customer_name,
    p_customer_email,
    p_customer_phone,
    p_candidate_datetimes,
    0,
    'private',
    p_private_group_id
  )
  RETURNING id INTO v_reservation_id;

  -- GM確認リクエストを作成（organization_id を含める）
  FOR v_gm_id IN
    SELECT ssa.staff_id
    FROM staff_scenario_assignments ssa
    WHERE (ssa.scenario_id = p_scenario_id OR ssa.scenario_id = v_scenario_master_id)
      AND (ssa.can_main_gm = true OR ssa.can_sub_gm = true)
  LOOP
    INSERT INTO gm_availability_responses (
      reservation_id,
      staff_id,
      response_status,
      available_candidates,
      organization_id,
      created_at
    ) VALUES (
      v_reservation_id,
      v_gm_id,
      'pending',
      NULL,
      v_org_id,
      NOW()
    )
    ON CONFLICT (reservation_id, staff_id) DO NOTHING;
  END LOOP;

  RETURN v_reservation_id;
END;
$$;

-- 権限の再付与
GRANT EXECUTE ON FUNCTION create_private_booking_request(UUID, UUID, TEXT, TEXT, TEXT, INTEGER, JSONB, TEXT, TEXT, UUID) TO authenticated;

-- 通知
DO $$
BEGIN
  RAISE NOTICE 'gm_availability_responses への organization_id 設定を追加しました';
END $$;

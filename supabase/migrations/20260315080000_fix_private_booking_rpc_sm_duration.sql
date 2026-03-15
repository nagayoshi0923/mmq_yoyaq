-- =============================================================================
-- 20260315080000: create_private_booking_request の scenario_masters カラム名修正
-- =============================================================================
-- 問題: sm.duration を参照していたが、scenario_masters には duration がない
--       正しくは sm.official_duration
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
  v_scenario_title TEXT;
  v_duration INTEGER;
  v_participation_fee NUMERIC;
  v_total_price NUMERIC;
  v_reservation_id UUID;
  v_gm_id UUID;
  v_org_id UUID;
  v_first_candidate JSONB;
  v_requested_datetime TIMESTAMPTZ;
  v_scenario_master_id UUID;
BEGIN
  -- シナリオ情報を取得（organization_scenariosから）
  -- カラム名の対応:
  --   os.override_title / sm.title
  --   os.duration / sm.official_duration
  --   os.participation_fee / sm.participation_fee
  SELECT 
    COALESCE(os.override_title, sm.title),
    COALESCE(os.duration, sm.official_duration),
    COALESCE(os.participation_fee, sm.participation_fee),
    os.organization_id,
    os.scenario_master_id
  INTO 
    v_scenario_title,
    v_duration,
    v_participation_fee,
    v_org_id,
    v_scenario_master_id
  FROM organization_scenarios os
  JOIN scenario_masters sm ON os.scenario_master_id = sm.id
  WHERE os.id = p_scenario_id
     OR os.scenario_master_id = p_scenario_id;
  
  -- organization_scenarios で見つからない場合は scenario_masters から取得
  IF v_scenario_title IS NULL THEN
    SELECT title, official_duration, participation_fee
    INTO v_scenario_title, v_duration, v_participation_fee
    FROM scenario_masters
    WHERE id = p_scenario_id;
    
    v_scenario_master_id := p_scenario_id;
  END IF;

  IF v_scenario_title IS NULL THEN
    RAISE EXCEPTION 'Scenario not found: %', p_scenario_id USING ERRCODE = 'P0001';
  END IF;

  -- デフォルト値の設定
  v_duration := COALESCE(v_duration, 240);
  v_participation_fee := COALESCE(v_participation_fee, 4000);

  -- p_private_group_id から organization_id を取得
  IF v_org_id IS NULL AND p_private_group_id IS NOT NULL THEN
    SELECT organization_id INTO v_org_id
    FROM private_groups
    WHERE id = p_private_group_id;
  END IF;

  -- それでも見つからない場合は scenario_master から組織を検索
  IF v_org_id IS NULL THEN
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

  -- 予約を作成（reservation_source を 'web_private' に設定）
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
    reservation_source,
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
    'normal',
    'private_booking',
    'web_private',
    p_private_group_id
  )
  RETURNING id INTO v_reservation_id;

  -- private_group_id が指定されている場合、private_groups.reservation_id を更新
  IF p_private_group_id IS NOT NULL THEN
    UPDATE private_groups
    SET reservation_id = v_reservation_id,
        status = 'booking_requested',
        updated_at = NOW()
    WHERE id = p_private_group_id;
  END IF;

  -- GM確認レコードを作成（担当GMがいる場合のみ）
  -- gm_scenario_assignments から担当GMを取得
  FOR v_gm_id IN
    SELECT staff_id
    FROM gm_scenario_assignments
    WHERE scenario_id = v_scenario_master_id
      AND organization_id = v_org_id
  LOOP
    INSERT INTO gm_availability_responses (
      organization_id,
      reservation_id,
      staff_id,
      response_status,
      available_candidates
    ) VALUES (
      v_org_id,
      v_reservation_id,
      v_gm_id,
      'pending',
      NULL
    )
    ON CONFLICT (reservation_id, staff_id) DO NOTHING;
  END LOOP;

  RETURN v_reservation_id;
END;
$$;

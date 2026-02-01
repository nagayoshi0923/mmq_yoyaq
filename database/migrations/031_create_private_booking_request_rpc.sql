-- =============================================================================
-- マイグレーション 031: 貸切予約リクエスト用RPC関数
-- =============================================================================
-- 
-- 作成日: 2026-02-01
-- 
-- 問題:
--   貸切予約がフロントから直接INSERTされており、
--   料金改ざん・バリデーションバイパスが可能だった
-- 
-- 修正:
--   サーバー側で料金計算・バリデーションを行うRPC関数を作成
-- 
-- =============================================================================

CREATE OR REPLACE FUNCTION create_private_booking_request(
  p_scenario_id UUID,
  p_customer_id UUID,
  p_customer_name TEXT,
  p_customer_email TEXT,
  p_customer_phone TEXT,
  p_participant_count INTEGER,
  p_candidate_datetimes JSONB,  -- {candidates: [...], requestedStores: [...]}
  p_notes TEXT DEFAULT NULL,
  p_reservation_number TEXT DEFAULT NULL  -- 冪等性キー
) RETURNS UUID
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql AS $$
DECLARE
  v_reservation_id UUID;
  v_scenario_title TEXT;
  v_participation_fee INTEGER;
  v_max_participants INTEGER;
  v_duration INTEGER;
  v_scenario_org_id UUID;
  v_customer_org_id UUID;
  v_customer_user_id UUID;
  v_caller_org_id UUID;
  v_is_admin BOOLEAN;
  v_base_price INTEGER;
  v_total_price INTEGER;
  v_first_candidate JSONB;
  v_first_date DATE;
  v_first_start_time TEXT;
  v_requested_datetime TIMESTAMP;
  v_existing_reservation_id UUID;
  v_reservation_number TEXT;
  v_candidate_count INTEGER;
BEGIN
  -- ==========================================================================
  -- バリデーション
  -- ==========================================================================
  
  IF p_participant_count <= 0 THEN
    RAISE EXCEPTION 'INVALID_PARTICIPANT_COUNT' USING ERRCODE = 'P0001';
  END IF;

  IF p_customer_name IS NULL OR trim(p_customer_name) = '' THEN
    RAISE EXCEPTION 'CUSTOMER_NAME_REQUIRED' USING ERRCODE = 'P0020';
  END IF;

  IF p_customer_email IS NULL OR trim(p_customer_email) = '' THEN
    RAISE EXCEPTION 'CUSTOMER_EMAIL_REQUIRED' USING ERRCODE = 'P0021';
  END IF;

  IF p_customer_phone IS NULL OR trim(p_customer_phone) = '' THEN
    RAISE EXCEPTION 'CUSTOMER_PHONE_REQUIRED' USING ERRCODE = 'P0022';
  END IF;

  -- 候補日時のバリデーション
  v_candidate_count := jsonb_array_length(COALESCE(p_candidate_datetimes->'candidates', '[]'::jsonb));
  IF v_candidate_count = 0 THEN
    RAISE EXCEPTION 'CANDIDATE_DATETIMES_REQUIRED' USING ERRCODE = 'P0023';
  END IF;

  -- ==========================================================================
  -- 冪等性チェック（二重作成防止）
  -- ==========================================================================
  
  IF p_reservation_number IS NOT NULL THEN
    SELECT id INTO v_existing_reservation_id
    FROM reservations
    WHERE reservation_number = p_reservation_number
    LIMIT 1;

    IF v_existing_reservation_id IS NOT NULL THEN
      -- 既存の予約を返す（二重作成を防止）
      RETURN v_existing_reservation_id;
    END IF;
  END IF;

  -- ==========================================================================
  -- シナリオ情報を取得（料金計算のため）
  -- ==========================================================================
  
  SELECT 
    title,
    participation_fee,
    COALESCE(player_count_max, 8),
    COALESCE(duration, 180),
    organization_id
  INTO v_scenario_title, v_participation_fee, v_max_participants, v_duration, v_scenario_org_id
  FROM scenarios
  WHERE id = p_scenario_id
    AND status IN ('available', 'maintenance', 'retired');

  IF NOT FOUND THEN
    RAISE EXCEPTION 'SCENARIO_NOT_FOUND' USING ERRCODE = 'P0024';
  END IF;

  -- 参加人数の上限チェック
  IF p_participant_count > v_max_participants THEN
    RAISE EXCEPTION 'PARTICIPANT_COUNT_EXCEEDS_MAX' USING ERRCODE = 'P0025';
  END IF;

  -- ==========================================================================
  -- 顧客認可
  -- ==========================================================================
  
  SELECT user_id, organization_id
  INTO v_customer_user_id, v_customer_org_id
  FROM customers
  WHERE id = p_customer_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'CUSTOMER_NOT_FOUND' USING ERRCODE = 'P0009';
  END IF;

  v_caller_org_id := get_user_organization_id();
  v_is_admin := is_org_admin();

  -- 権限チェック: 自分自身の予約か、管理者/スタッフか
  IF NOT v_is_admin THEN
    IF v_customer_user_id IS DISTINCT FROM auth.uid() THEN
      -- スタッフチェック
      IF NOT EXISTS (
        SELECT 1 FROM staff
        WHERE user_id = auth.uid()
          AND organization_id = v_scenario_org_id
          AND status = 'active'
      ) THEN
        RAISE EXCEPTION 'FORBIDDEN_CUSTOMER' USING ERRCODE = 'P0011';
      END IF;
    END IF;
  END IF;

  -- ==========================================================================
  -- 料金計算（サーバー側で強制）
  -- ==========================================================================
  
  -- 基本料金: participation_fee * participant_count
  v_base_price := COALESCE(v_participation_fee, 0) * p_participant_count;
  v_total_price := v_base_price;

  -- ==========================================================================
  -- 予約番号生成
  -- ==========================================================================
  
  IF p_reservation_number IS NOT NULL THEN
    v_reservation_number := p_reservation_number;
  ELSE
    -- YYMMDD-XXXX形式
    v_reservation_number := to_char(NOW() AT TIME ZONE 'Asia/Tokyo', 'YYMMDD') || '-' || 
                            upper(substr(md5(random()::text), 1, 4));
  END IF;

  -- ==========================================================================
  -- 最初の候補日時を取得
  -- ==========================================================================
  
  v_first_candidate := p_candidate_datetimes->'candidates'->0;
  v_first_date := (v_first_candidate->>'date')::DATE;
  v_first_start_time := v_first_candidate->>'startTime';
  v_requested_datetime := (v_first_date || ' ' || v_first_start_time)::TIMESTAMP;

  -- ==========================================================================
  -- 予約レコード作成
  -- ==========================================================================
  
  INSERT INTO reservations (
    title,
    reservation_number,
    scenario_id,
    customer_id,
    requested_datetime,
    actual_datetime,
    duration,
    participant_count,
    base_price,
    total_price,
    final_price,
    unit_price,
    status,
    priority,
    candidate_datetimes,
    customer_notes,
    created_by,
    customer_name,
    customer_email,
    customer_phone,
    reservation_source,
    organization_id
  ) VALUES (
    '【貸切希望】' || v_scenario_title || '（候補' || v_candidate_count || '件）',
    v_reservation_number,
    p_scenario_id,
    p_customer_id,
    v_requested_datetime,
    v_requested_datetime,
    v_duration,
    p_participant_count,
    v_base_price,
    v_total_price,
    v_total_price,
    COALESCE(v_participation_fee, 0),
    'pending',
    0,
    p_candidate_datetimes,
    p_notes,
    auth.uid(),
    p_customer_name,
    p_customer_email,
    p_customer_phone,
    'web_private',
    COALESCE(v_customer_org_id, v_scenario_org_id)
  )
  RETURNING id INTO v_reservation_id;

  -- ==========================================================================
  -- GM確認レコードを作成
  -- ==========================================================================
  
  INSERT INTO gm_availability_responses (
    reservation_id,
    staff_id,
    gm_name,
    response_status,
    notified_at,
    organization_id
  )
  SELECT
    v_reservation_id,
    ssa.staff_id,
    s.name,
    'pending',
    NOW(),
    COALESCE(v_customer_org_id, v_scenario_org_id)
  FROM staff_scenario_assignments ssa
  JOIN staff s ON s.id = ssa.staff_id
  WHERE ssa.scenario_id = p_scenario_id
    AND s.status = 'active'
  ON CONFLICT DO NOTHING;

  RETURN v_reservation_id;
END;
$$;

COMMENT ON FUNCTION create_private_booking_request IS 
'貸切予約リクエストを作成。料金はサーバー側で計算し、バリデーションを強制。冪等性キー対応。';

GRANT EXECUTE ON FUNCTION create_private_booking_request TO authenticated;

-- 完了確認
DO $$ 
BEGIN
  RAISE NOTICE '✅ マイグレーション 031 完了: 貸切予約リクエスト用RPC関数を作成';
END $$;

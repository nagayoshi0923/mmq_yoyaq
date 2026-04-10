-- =============================================================================
-- 20260410100000: create_private_booking_request にサーバー側空き判定を追加
-- =============================================================================
-- 変更内容:
--   全候補日時が全希望店舗で既存公演と衝突する場合、RPC がエラーを返す。
--   クライアント側の空き判定に加え、サーバー側でも重複を防止する。
-- 正規ソース: supabase/rpcs/create_private_booking_request.sql
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
  -- 空き判定用
  v_cand JSONB;
  v_cand_date DATE;
  v_cand_start TIME;
  v_cand_end TIME;
  v_store_id_text TEXT;
  v_store_uuid UUID;
  v_viable_count INTEGER := 0;
  v_store_available BOOLEAN;
  v_requested_store_count INTEGER;
BEGIN
  -- シナリオ情報を取得（organization_scenariosから）
  SELECT 
    COALESCE(os.override_title, sm.title),
    COALESCE(os.duration, sm.official_duration),
    os.participation_fee,
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
  
  -- organization_scenarios で見つからない場合は scenarios_v2 ビューから取得
  IF v_scenario_title IS NULL THEN
    SELECT title, duration, participation_fee
    INTO v_scenario_title, v_duration, v_participation_fee
    FROM scenarios_v2
    WHERE id = p_scenario_id;
    
    v_scenario_master_id := p_scenario_id;
  END IF;

  -- scenarios_v2 でも見つからない場合は scenario_masters のタイトルだけ取得
  IF v_scenario_title IS NULL THEN
    SELECT title, official_duration
    INTO v_scenario_title, v_duration
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

  -- =========================================================================
  -- サーバー側空き判定: 全候補×全希望店舗で衝突チェック
  -- 少なくとも1つの候補が1つの店舗で空いていれば通す。
  -- 全候補が全店舗で既存公演と衝突する場合のみ拒否する。
  -- =========================================================================
  v_requested_store_count := jsonb_array_length(
    COALESCE(p_candidate_datetimes->'requestedStores', '[]'::jsonb)
  );

  IF v_requested_store_count > 0 THEN
    FOR v_cand IN
      SELECT value FROM jsonb_array_elements(
        COALESCE(p_candidate_datetimes->'candidates', '[]'::jsonb)
      )
    LOOP
      v_cand_date  := (v_cand->>'date')::DATE;
      v_cand_start := COALESCE(v_cand->>'startTime', '10:00')::TIME;
      v_cand_end   := COALESCE(v_cand->>'endTime',   '23:00')::TIME;

      v_store_available := false;

      FOR v_store_id_text IN
        SELECT value->>'storeId'
        FROM jsonb_array_elements(p_candidate_datetimes->'requestedStores')
      LOOP
        v_store_uuid := v_store_id_text::UUID;

        -- 60分バッファ込みで衝突がなければ空きあり
        IF NOT EXISTS (
          SELECT 1 FROM schedule_events se
          WHERE se.store_id = v_store_uuid
            AND se.date = v_cand_date
            AND se.is_cancelled = false
            AND se.start_time < v_cand_end   + INTERVAL '60 minutes'
            AND se.end_time   > v_cand_start - INTERVAL '60 minutes'
        ) THEN
          v_store_available := true;
          EXIT;
        END IF;
      END LOOP;

      IF v_store_available THEN
        v_viable_count := v_viable_count + 1;
      END IF;
    END LOOP;

    IF v_viable_count = 0
       AND jsonb_array_length(COALESCE(p_candidate_datetimes->'candidates', '[]'::jsonb)) > 0
    THEN
      RAISE EXCEPTION
        'All candidate dates conflict with existing events at the requested stores'
        USING ERRCODE = 'P0030';
    END IF;
  END IF;
  -- =========================================================================

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
    0,
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
  -- staff_scenario_assignments から担当GMを取得
  FOR v_gm_id IN
    SELECT ssa.staff_id
    FROM staff_scenario_assignments ssa
    WHERE (ssa.scenario_id = p_scenario_id OR ssa.scenario_id = v_scenario_master_id)
      AND (ssa.can_main_gm = true OR ssa.can_sub_gm = true)
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

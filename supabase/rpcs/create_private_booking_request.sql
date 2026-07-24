-- 正規ソース: create_private_booking_request
-- 最終更新: 20260723210000_enforce_private_booking_blocked_slots.sql
-- このファイルと migrations 内の最新定義は常に同内容に保つこと

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
  v_row_org_id UUID;
  v_scenario_org_count INTEGER;
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
  v_store_available BOOLEAN;
  v_blocked_store_count INTEGER;
  v_requested_store_count INTEGER;
  v_candidate_count INTEGER;
  v_candidate_time_slot TEXT;
  v_caller_user_id UUID;
  v_customer_org_id UUID;
  v_group RECORD;
  v_group_candidate_id UUID;
  v_group_candidate_date DATE;
  v_group_candidate_time_slot TEXT;
  v_group_candidate_start TIME;
  v_group_candidate_end TIME;
  v_group_candidate_order INTEGER;
  v_store_name TEXT;
  v_store_short_name TEXT;
  v_seen_store_ids UUID[] := '{}'::UUID[];
  v_seen_group_candidate_ids UUID[] := '{}'::UUID[];
  v_trusted_candidates JSONB := '[]'::JSONB;
  v_trusted_requested_stores JSONB := '[]'::JSONB;
  v_trusted_candidate_datetimes JSONB;
  v_candidate_order INTEGER := 0;
  v_updated_count INTEGER;
BEGIN
  -- 20260414150000 の認可境界を維持する。SECURITY DEFINERでもanon/なりすましを許可しない。
  v_caller_user_id := auth.uid();
  IF v_caller_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = 'P0401';
  END IF;

  IF p_customer_id IS NULL THEN
    RAISE EXCEPTION 'Authenticated customer is required' USING ERRCODE = 'P0401';
  END IF;

  SELECT customer.organization_id
  INTO v_customer_org_id
  FROM customers customer
  WHERE customer.id = p_customer_id
    AND customer.user_id = v_caller_user_id
  FOR SHARE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Unauthorized: customer does not belong to authenticated user'
      USING ERRCODE = 'P0401';
  END IF;

  -- ===========================================================================
  -- 組織の決定（最優先: グループの組織 = 申込ページの組織コンテキスト）
  -- ===========================================================================
  IF p_private_group_id IS NOT NULL THEN
    SELECT *
    INTO v_group
    FROM private_groups
    WHERE id = p_private_group_id
    FOR UPDATE;

    IF NOT FOUND
       OR v_group.organizer_id IS DISTINCT FROM v_caller_user_id
       OR (
         v_customer_org_id IS NOT NULL
         AND v_group.organization_id IS DISTINCT FROM v_customer_org_id
       )
    THEN
      RAISE EXCEPTION 'Unauthorized private group'
        USING ERRCODE = 'P0401';
    END IF;

    v_org_id := v_group.organization_id;
  END IF;

  -- ===========================================================================
  -- シナリオ情報の取得
  -- 1) p_scenario_id を organization_scenarios.id（org固有ID）として検索。
  --    組織が確定済みの場合はその組織の行に限定する。
  -- ===========================================================================
  SELECT
    COALESCE(os.override_title, sm.title),
    COALESCE(os.duration, sm.official_duration),
    os.participation_fee,
    os.organization_id,
    os.scenario_master_id
  INTO
    v_scenario_title, v_duration, v_participation_fee, v_row_org_id, v_scenario_master_id
  FROM organization_scenarios os
  JOIN scenario_masters sm ON os.scenario_master_id = sm.id
  WHERE os.id = p_scenario_id
    AND (v_org_id IS NULL OR os.organization_id = v_org_id);

  IF FOUND THEN
    v_org_id := COALESCE(v_org_id, v_row_org_id);
  END IF;

  -- 2) 見つからない場合、p_scenario_id を scenario_master_id として検索（組織確定済み）
  IF v_scenario_title IS NULL AND v_org_id IS NOT NULL THEN
    SELECT
      COALESCE(os.override_title, sm.title),
      COALESCE(os.duration, sm.official_duration),
      os.participation_fee,
      os.scenario_master_id
    INTO
      v_scenario_title, v_duration, v_participation_fee, v_scenario_master_id
    FROM organization_scenarios os
    JOIN scenario_masters sm ON os.scenario_master_id = sm.id
    WHERE os.scenario_master_id = p_scenario_id
      AND os.organization_id = v_org_id
    ORDER BY os.created_at
    LIMIT 1;
  END IF;

  -- 3) 組織未確定で master_id 検索: 登録が1組織のみの場合に限り採用。
  --    複数組織に登録されている場合は不定な選択をせずエラーにする。
  IF v_scenario_title IS NULL AND v_org_id IS NULL THEN
    SELECT COUNT(DISTINCT os.organization_id) INTO v_scenario_org_count
    FROM organization_scenarios os
    WHERE os.scenario_master_id = p_scenario_id;

    IF v_scenario_org_count > 1 THEN
      RAISE EXCEPTION 'Scenario % is registered in multiple organizations; organization context (private group) is required', p_scenario_id
        USING ERRCODE = 'P0031';
    ELSIF v_scenario_org_count = 1 THEN
      SELECT
        COALESCE(os.override_title, sm.title),
        COALESCE(os.duration, sm.official_duration),
        os.participation_fee,
        os.organization_id,
        os.scenario_master_id
      INTO
        v_scenario_title, v_duration, v_participation_fee, v_row_org_id, v_scenario_master_id
      FROM organization_scenarios os
      JOIN scenario_masters sm ON os.scenario_master_id = sm.id
      WHERE os.scenario_master_id = p_scenario_id
      ORDER BY os.created_at
      LIMIT 1;

      IF FOUND THEN
        v_org_id := v_row_org_id;
      END IF;
    END IF;
  END IF;

  -- 4) organization_scenarios で見つからない場合は scenarios_v2 ビューから取得
  --    （組織はここでは確定しない — グループ由来の v_org_id のみ有効）
  IF v_scenario_title IS NULL THEN
    SELECT title, duration, participation_fee
    INTO v_scenario_title, v_duration, v_participation_fee
    FROM scenarios_v2
    WHERE id = p_scenario_id;

    v_scenario_master_id := p_scenario_id;
  END IF;

  -- 5) scenarios_v2 でも見つからない場合は scenario_masters のタイトルだけ取得
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

  -- platform customerはorganization_id=NULLを正規形とする。org固定customerだけ不一致を拒否する。
  IF v_customer_org_id IS NOT NULL
     AND v_org_id IS DISTINCT FROM v_customer_org_id
  THEN
    RAISE EXCEPTION 'Customer organization does not match booking organization'
      USING ERRCODE = 'P0401';
  END IF;

  IF p_private_group_id IS NOT NULL
     AND v_group.scenario_master_id IS NOT NULL
     AND v_group.scenario_master_id IS DISTINCT FROM v_scenario_master_id
  THEN
    RAISE EXCEPTION 'Private group scenario does not match booking scenario'
      USING ERRCODE = 'P0043';
  END IF;

  -- デフォルト値の設定
  v_duration := COALESCE(v_duration, 240);
  v_participation_fee := COALESCE(v_participation_fee, 4000);

  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'Organization not found for scenario' USING ERRCODE = 'P0026';
  END IF;

  -- 参加人数の上限チェック
  IF p_participant_count > 10 THEN
    RAISE EXCEPTION 'Participant count exceeds maximum' USING ERRCODE = 'P0025';
  END IF;

  IF jsonb_typeof(p_candidate_datetimes) IS DISTINCT FROM 'object'
     OR jsonb_typeof(p_candidate_datetimes->'requestedStores') IS DISTINCT FROM 'array'
     OR jsonb_typeof(p_candidate_datetimes->'candidates') IS DISTINCT FROM 'array'
  THEN
    RAISE EXCEPTION 'INVALID_CANDIDATE_PAYLOAD' USING ERRCODE = 'P0041';
  END IF;

  v_requested_store_count := jsonb_array_length(p_candidate_datetimes->'requestedStores');
  v_candidate_count := jsonb_array_length(p_candidate_datetimes->'candidates');
  IF v_requested_store_count = 0 OR v_candidate_count = 0 THEN
    RAISE EXCEPTION 'CANDIDATES_AND_REQUESTED_STORES_REQUIRED' USING ERRCODE = 'P0023';
  END IF;

  -- store名を含む保存payloadはDBから再構築する。group経路ではpreferred_store_idsと完全一致を必須化。
  IF p_private_group_id IS NOT NULL
     AND v_requested_store_count IS DISTINCT FROM cardinality(
       COALESCE(v_group.preferred_store_ids, '{}'::UUID[])
     )
  THEN
    RAISE EXCEPTION 'REQUESTED_STORES_DO_NOT_MATCH_PRIVATE_GROUP' USING ERRCODE = 'P0042';
  END IF;

  FOR v_store_id_text IN
    SELECT value->>'storeId'
    FROM jsonb_array_elements(p_candidate_datetimes->'requestedStores')
  LOOP
    BEGIN
      v_store_uuid := v_store_id_text::UUID;
    EXCEPTION WHEN OTHERS THEN
      RAISE EXCEPTION 'INVALID_REQUESTED_STORE' USING ERRCODE = 'P0042';
    END;

    IF v_store_uuid = ANY(v_seen_store_ids) THEN
      RAISE EXCEPTION 'DUPLICATE_REQUESTED_STORE' USING ERRCODE = 'P0042';
    END IF;

    IF p_private_group_id IS NOT NULL
       AND NOT (
         v_store_uuid = ANY(COALESCE(v_group.preferred_store_ids, '{}'::UUID[]))
       )
    THEN
      RAISE EXCEPTION 'REQUESTED_STORE_NOT_IN_PRIVATE_GROUP' USING ERRCODE = 'P0042';
    END IF;

    SELECT store.name, store.short_name
    INTO v_store_name, v_store_short_name
    FROM stores store
    WHERE store.id = v_store_uuid
      AND store.organization_id = v_org_id
      AND store.status = 'active';

    IF NOT FOUND THEN
      RAISE EXCEPTION 'INVALID_REQUESTED_STORE' USING ERRCODE = 'P0042';
    END IF;

    v_seen_store_ids := array_append(v_seen_store_ids, v_store_uuid);
    v_trusted_requested_stores := v_trusted_requested_stores || jsonb_build_array(
      jsonb_build_object(
        'storeId', v_store_uuid::TEXT,
        'storeName', v_store_name,
        'storeShortName', COALESCE(v_store_short_name, v_store_name)
      )
    );
  END LOOP;

  -- group経路はclient値をselectorとしてのみ使い、locked DB候補から全フィールドを復元する。
  FOR v_cand IN
    SELECT value FROM jsonb_array_elements(p_candidate_datetimes->'candidates')
  LOOP
    v_candidate_order := v_candidate_order + 1;
    BEGIN
      v_cand_date  := (v_cand->>'date')::DATE;
      v_cand_start := (v_cand->>'startTime')::TIME;
      v_cand_end   := (v_cand->>'endTime')::TIME;
    EXCEPTION WHEN OTHERS THEN
      RAISE EXCEPTION 'INVALID_CANDIDATE_DATETIME' USING ERRCODE = 'P0041';
    END;

    IF v_cand_date IS NULL
       OR v_cand_start IS NULL
       OR v_cand_end IS NULL
       OR v_cand_start >= v_cand_end
    THEN
      RAISE EXCEPTION 'INVALID_CANDIDATE_DATETIME' USING ERRCODE = 'P0041';
    END IF;

    v_candidate_time_slot := CASE v_cand->>'timeSlot'
      WHEN 'morning' THEN 'morning'
      WHEN '朝' THEN 'morning'
      WHEN '午前' THEN 'morning'
      WHEN 'afternoon' THEN 'afternoon'
      WHEN '昼' THEN 'afternoon'
      WHEN '午後' THEN 'afternoon'
      WHEN 'evening' THEN 'evening'
      WHEN '夜' THEN 'evening'
      WHEN '夜間' THEN 'evening'
      ELSE NULL
    END;
    IF v_candidate_time_slot IS NULL THEN
      RAISE EXCEPTION 'INVALID_CANDIDATE_TIME_SLOT' USING ERRCODE = 'P0041';
    END IF;

    IF p_private_group_id IS NOT NULL THEN
      SELECT
        candidate.id,
        candidate.date,
        candidate.time_slot,
        candidate.start_time::TIME,
        candidate.end_time::TIME,
        candidate.order_num
      INTO
        v_group_candidate_id,
        v_group_candidate_date,
        v_group_candidate_time_slot,
        v_group_candidate_start,
        v_group_candidate_end,
        v_group_candidate_order
      FROM private_group_candidate_dates candidate
      WHERE candidate.group_id = p_private_group_id
        AND candidate.status IS DISTINCT FROM 'rejected'
        AND candidate.date = v_cand_date
        AND candidate.start_time::TIME = v_cand_start
        AND CASE candidate.time_slot
          WHEN 'morning' THEN 'morning'
          WHEN '朝' THEN 'morning'
          WHEN '午前' THEN 'morning'
          WHEN 'afternoon' THEN 'afternoon'
          WHEN '昼' THEN 'afternoon'
          WHEN '午後' THEN 'afternoon'
          WHEN 'evening' THEN 'evening'
          WHEN '夜' THEN 'evening'
          WHEN '夜間' THEN 'evening'
          ELSE NULL
        END = v_candidate_time_slot
      ORDER BY candidate.order_num, candidate.id
      LIMIT 1
      FOR SHARE;

      IF NOT FOUND OR v_group_candidate_id = ANY(v_seen_group_candidate_ids) THEN
        RAISE EXCEPTION 'CANDIDATE_NOT_IN_PRIVATE_GROUP' USING ERRCODE = 'P0041';
      END IF;

      v_seen_group_candidate_ids := array_append(
        v_seen_group_candidate_ids,
        v_group_candidate_id
      );
      v_cand_date := v_group_candidate_date;
      v_cand_start := v_group_candidate_start;
      v_cand_end := v_group_candidate_end;
      v_candidate_time_slot := CASE v_group_candidate_time_slot
        WHEN 'morning' THEN 'morning'
        WHEN '朝' THEN 'morning'
        WHEN '午前' THEN 'morning'
        WHEN 'afternoon' THEN 'afternoon'
        WHEN '昼' THEN 'afternoon'
        WHEN '午後' THEN 'afternoon'
        WHEN 'evening' THEN 'evening'
        WHEN '夜' THEN 'evening'
        WHEN '夜間' THEN 'evening'
        ELSE NULL
      END;
      v_candidate_order := v_group_candidate_order;
    END IF;

    v_trusted_candidates := v_trusted_candidates || jsonb_build_array(
      jsonb_build_object(
        'order', v_candidate_order,
        'date', v_cand_date::TEXT,
        'timeSlot', CASE v_candidate_time_slot
          WHEN 'morning' THEN '午前'
          WHEN 'afternoon' THEN '午後'
          ELSE '夜間'
        END,
        'startTime', to_char(v_cand_start, 'HH24:MI'),
        'endTime', to_char(v_cand_end, 'HH24:MI'),
        'status', 'pending'
      )
    );
  END LOOP;

  v_trusted_candidate_datetimes := jsonb_build_object(
    'candidates', v_trusted_candidates,
    'requestedStores', v_trusted_requested_stores
  );

  -- block/unblock・公演追加との競合を直列化し、同一transactionの最新状態で判定する。
  LOCK TABLE schedule_blocked_slots IN SHARE MODE;
  LOCK TABLE schedule_events IN SHARE MODE;

  -- =========================================================================
  -- サーバー側空き判定: 全候補がそれぞれ1店舗以上で受付可能であることを強制する。
  -- =========================================================================
  v_requested_store_count := jsonb_array_length(
    v_trusted_candidate_datetimes->'requestedStores'
  );
  v_candidate_count := jsonb_array_length(
    v_trusted_candidate_datetimes->'candidates'
  );

  FOR v_cand IN
    SELECT value FROM jsonb_array_elements(v_trusted_candidate_datetimes->'candidates')
  LOOP
    BEGIN
      v_cand_date  := (v_cand->>'date')::DATE;
      v_cand_start := (v_cand->>'startTime')::TIME;
      v_cand_end   := (v_cand->>'endTime')::TIME;
    EXCEPTION WHEN OTHERS THEN
      RAISE EXCEPTION 'INVALID_CANDIDATE_DATETIME' USING ERRCODE = 'P0041';
    END;

    IF v_cand_date IS NULL
       OR v_cand_start IS NULL
       OR v_cand_end IS NULL
       OR v_cand_start >= v_cand_end
    THEN
      RAISE EXCEPTION 'INVALID_CANDIDATE_DATETIME' USING ERRCODE = 'P0041';
    END IF;

    v_candidate_time_slot := CASE v_cand->>'timeSlot'
      WHEN 'morning' THEN 'morning'
      WHEN '朝' THEN 'morning'
      WHEN '午前' THEN 'morning'
      WHEN 'afternoon' THEN 'afternoon'
      WHEN '昼' THEN 'afternoon'
      WHEN '午後' THEN 'afternoon'
      WHEN 'evening' THEN 'evening'
      WHEN '夜' THEN 'evening'
      WHEN '夜間' THEN 'evening'
      ELSE NULL
    END;
    IF v_candidate_time_slot IS NULL THEN
      RAISE EXCEPTION 'INVALID_CANDIDATE_TIME_SLOT' USING ERRCODE = 'P0041';
    END IF;

    v_store_available := false;
    v_blocked_store_count := 0;

    FOR v_store_id_text IN
      SELECT value->>'storeId'
      FROM jsonb_array_elements(v_trusted_candidate_datetimes->'requestedStores')
    LOOP
      v_store_uuid := v_store_id_text::UUID;

      IF EXISTS (
        SELECT 1
        FROM schedule_blocked_slots blocked
        WHERE blocked.organization_id = v_org_id
          AND blocked.store_id = v_store_uuid::TEXT
          AND blocked.date = v_cand_date
          AND blocked.time_slot = v_candidate_time_slot
      ) THEN
        v_blocked_store_count := v_blocked_store_count + 1;
        CONTINUE;
      END IF;

      IF EXISTS (
        SELECT 1
        FROM schedule_events event
        WHERE event.organization_id = v_org_id
          AND event.store_id = v_store_uuid
          AND event.date = v_cand_date
          AND event.is_cancelled = false
          AND event.start_time < v_cand_end + INTERVAL '60 minutes'
          AND event.end_time > v_cand_start - INTERVAL '60 minutes'
      ) THEN
        CONTINUE;
      END IF;

      v_store_available := true;
      EXIT;
    END LOOP;

    IF NOT v_store_available THEN
      IF v_blocked_store_count = v_requested_store_count THEN
        RAISE EXCEPTION 'PRIVATE_BOOKING_SLOT_BLOCKED:%:%', v_cand_date, v_candidate_time_slot
          USING ERRCODE = 'P0040';
      END IF;
      RAISE EXCEPTION 'PRIVATE_BOOKING_CANDIDATE_CONFLICT:%:%', v_cand_date, v_candidate_time_slot
        USING ERRCODE = 'P0030';
    END IF;
  END LOOP;
  -- =========================================================================

  -- 料金計算
  v_total_price := p_participant_count * v_participation_fee;

  -- 最初の候補日時を取得
  v_first_candidate := v_trusted_candidate_datetimes->'candidates'->0;
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
    v_trusted_candidate_datetimes,
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
    WHERE id = p_private_group_id
      AND organization_id = v_org_id
      AND organizer_id = v_caller_user_id;

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;
    IF v_updated_count <> 1 THEN
      RAISE EXCEPTION 'PRIVATE_GROUP_UPDATE_FAILED' USING ERRCODE = 'P0043';
    END IF;
  END IF;

  -- GM確認レコードを作成（担当GMがいる場合のみ）
  -- staff_scenario_assignments から担当GMを取得
  -- ✅ v_org_id 所属のスタッフに限定（他組織GMへの pending 行生成を防ぐ）
  FOR v_gm_id IN
    SELECT ssa.staff_id
    FROM staff_scenario_assignments ssa
    JOIN staff s ON s.id = ssa.staff_id
    WHERE (ssa.scenario_id = p_scenario_id OR ssa.scenario_id = v_scenario_master_id)
      AND (ssa.can_main_gm = true OR ssa.can_sub_gm = true)
      AND s.organization_id = v_org_id
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

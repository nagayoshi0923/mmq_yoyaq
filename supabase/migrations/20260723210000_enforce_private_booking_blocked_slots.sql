-- YOYAQ-004: 募集停止枠の貸切申請・承認を transaction 内で拒否する。
-- 正規ソース: supabase/rpcs/get_public_private_booking_availability.sql
--             supabase/rpcs/create_private_booking_request.sql
--             supabase/rpcs/approve_private_booking.sql
-- 正規ソース: get_public_private_booking_availability
-- 公開貸切画面へ、指定組織・店舗・期間の募集停止状態だけを返す（PIIを返さない）。

CREATE OR REPLACE FUNCTION public.get_public_private_booking_availability(
  p_organization_id UUID,
  p_store_ids UUID[],
  p_start_date DATE,
  p_end_date DATE
)
RETURNS TABLE (
  date DATE,
  store_id UUID,
  time_slot TEXT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_organization_id IS NULL
     OR p_start_date IS NULL
     OR p_end_date IS NULL
     OR p_start_date > p_end_date
     OR p_end_date - p_start_date > 180
  THEN
    RAISE EXCEPTION 'INVALID_AVAILABILITY_RANGE' USING ERRCODE = 'P0041';
  END IF;

  IF COALESCE(array_length(p_store_ids, 1), 0) = 0 THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    blocked.date,
    store.id,
    blocked.time_slot
  FROM public.schedule_blocked_slots blocked
  JOIN public.organizations organization
    ON organization.id = blocked.organization_id
   AND organization.is_active = TRUE
  JOIN public.stores store
    ON store.id::TEXT = blocked.store_id
   AND store.organization_id = blocked.organization_id
  WHERE blocked.organization_id = p_organization_id
    AND store.id = ANY(p_store_ids)
    AND store.status = 'active'
    AND blocked.date BETWEEN p_start_date AND p_end_date
    AND blocked.time_slot IN ('morning', 'afternoon', 'evening')
  ORDER BY blocked.date, store.id, blocked.time_slot;
END;
$$;

REVOKE ALL ON FUNCTION public.get_public_private_booking_availability(UUID, UUID[], DATE, DATE) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_private_booking_availability(UUID, UUID[], DATE, DATE)
  TO anon, authenticated, service_role;
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
-- 正規ソース: approve_private_booking
-- 2026-07-23 本番 pg_get_functiondef から復元し、募集停止・tenant・候補整合を追加。

CREATE OR REPLACE FUNCTION public.approve_private_booking(
  p_reservation_id UUID,
  p_selected_date DATE,
  p_selected_start_time TIME WITHOUT TIME ZONE,
  p_selected_end_time TIME WITHOUT TIME ZONE,
  p_selected_store_id UUID,
  p_selected_gm_id UUID,
  p_candidate_datetimes JSONB,
  p_scenario_title TEXT,
  p_customer_name TEXT,
  p_selected_sub_gm_id UUID DEFAULT NULL
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
  v_caller_staff_id UUID;
  v_schedule_event_id UUID;
  v_existing_event_id UUID;
  v_gm_name TEXT;
  v_sub_gm_name TEXT;
  v_store_name TEXT;
  v_store_short_name TEXT;
  v_updated_count INTEGER;
  v_private_group_id UUID;
  v_gms_array TEXT[];
  v_gm_roles JSONB;
  v_calendar_date DATE;
  v_raw TEXT;
  v_candidate JSONB;
  v_candidate_date DATE;
  v_candidate_start_time TIME;
  v_candidate_end_time TIME;
  v_candidate_time_slot TEXT;
  v_schedule_time_slot TEXT;
  v_trusted_candidate_found BOOLEAN := false;
  v_requested_store_count INTEGER;
  v_candidate_ordinal BIGINT;
  v_selected_candidate_ordinal BIGINT;
  v_normalized_candidate JSONB;
  v_rebuilt_candidates JSONB := '[]'::JSONB;
  v_confirmed_candidate_datetimes JSONB;
BEGIN
  SELECT *
  INTO v_reservation
  FROM reservations
  WHERE id = p_reservation_id
    AND status IN ('pending', 'pending_gm', 'gm_confirmed', 'pending_store', 'confirmed', 'cancelled')
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'RESERVATION_NOT_FOUND_OR_ALREADY_CONFIRMED' USING ERRCODE = 'P0018';
  END IF;

  v_org_id := v_reservation.organization_id;
  v_private_group_id := v_reservation.private_group_id;
  v_existing_event_id := v_reservation.schedule_event_id;

  v_caller_org_id := get_user_organization_id();
  IF auth.uid() IS NULL
     OR v_caller_org_id IS NULL
     OR v_caller_org_id IS DISTINCT FROM v_org_id
  THEN
    RAISE EXCEPTION 'UNAUTHORIZED' USING ERRCODE = 'P0010';
  END IF;

  SELECT id INTO v_caller_staff_id
  FROM staff
  WHERE user_id = auth.uid()
    AND organization_id = v_org_id
  ORDER BY id
  LIMIT 1;

  IF NOT is_staff_or_admin()
     OR (v_caller_staff_id IS NULL AND NOT is_org_admin())
  THEN
    RAISE EXCEPTION 'UNAUTHORIZED' USING ERRCODE = 'P0010';
  END IF;

  SELECT name INTO v_gm_name
  FROM staff
  WHERE id = p_selected_gm_id
    AND organization_id = v_org_id;

  IF v_gm_name IS NULL THEN
    RAISE EXCEPTION 'GM_NOT_FOUND' USING ERRCODE = 'P0022';
  END IF;

  v_sub_gm_name := NULL;
  IF p_selected_sub_gm_id IS NOT NULL THEN
    IF p_selected_sub_gm_id = p_selected_gm_id THEN
      RAISE EXCEPTION 'SUB_GM_SAME_AS_MAIN' USING ERRCODE = 'P0026';
    END IF;
    SELECT name INTO v_sub_gm_name
    FROM staff
    WHERE id = p_selected_sub_gm_id
      AND organization_id = v_org_id;
    IF v_sub_gm_name IS NULL THEN
      RAISE EXCEPTION 'SUB_GM_NOT_FOUND' USING ERRCODE = 'P0022';
    END IF;
  END IF;

  SELECT name, short_name
  INTO v_store_name, v_store_short_name
  FROM stores
  WHERE id = p_selected_store_id
    AND organization_id = v_org_id
    AND status = 'active';

  IF v_store_name IS NULL THEN
    RAISE EXCEPTION 'STORE_NOT_FOUND' USING ERRCODE = 'P0023';
  END IF;

  -- 希望店舗が保存されている申請では、その信頼済み集合からだけ承認する。
  v_requested_store_count := jsonb_array_length(
    COALESCE(v_reservation.candidate_datetimes->'requestedStores', '[]'::jsonb)
  );
  IF v_requested_store_count > 0 AND NOT EXISTS (
    SELECT 1
    FROM jsonb_array_elements(v_reservation.candidate_datetimes->'requestedStores') requested
    WHERE requested->>'storeId' = p_selected_store_id::TEXT
  ) THEN
    RAISE EXCEPTION 'STORE_NOT_REQUESTED' USING ERRCODE = 'P0042';
  END IF;

  -- clientが送ったconfirmed状態ではなく、予約に保存済みの候補から日付・開始・time_slotを復元する。
  FOR v_candidate, v_candidate_ordinal IN
    SELECT candidate.value, candidate.ordinality
    FROM jsonb_array_elements(
      COALESCE(v_reservation.candidate_datetimes->'candidates', '[]'::jsonb)
    ) WITH ORDINALITY AS candidate(value, ordinality)
  LOOP
    v_raw := v_candidate->>'date';
    BEGIN
      IF btrim(v_raw) ~ '^\d{4}-\d{2}-\d{2}$' THEN
        v_candidate_date := btrim(v_raw)::DATE;
      ELSE
        v_candidate_date := ((btrim(v_raw))::TIMESTAMPTZ AT TIME ZONE 'Asia/Tokyo')::DATE;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      CONTINUE;
    END;

    BEGIN
      v_candidate_start_time := (v_candidate->>'startTime')::TIME;
      v_candidate_end_time := (v_candidate->>'endTime')::TIME;
    EXCEPTION WHEN OTHERS THEN
      CONTINUE;
    END;

    IF v_candidate_date = p_selected_date
       AND v_candidate_start_time = p_selected_start_time
       AND v_candidate_end_time = p_selected_end_time
    THEN
      v_candidate_time_slot := CASE v_candidate->>'timeSlot'
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
      v_selected_candidate_ordinal := v_candidate_ordinal;
      v_trusted_candidate_found := true;
      EXIT;
    END IF;
  END LOOP;

  IF NOT v_trusted_candidate_found OR v_candidate_time_slot IS NULL THEN
    RAISE EXCEPTION 'INVALID_SELECTED_CANDIDATE' USING ERRCODE = 'P0041';
  END IF;
  IF p_selected_start_time >= p_selected_end_time THEN
    RAISE EXCEPTION 'INVALID_SELECTED_CANDIDATE_TIME' USING ERRCODE = 'P0041';
  END IF;

  -- live client互換のshapeを維持しつつ、保存済み候補だけからconfirmed状態を再構築する。
  FOR v_candidate, v_candidate_ordinal IN
    SELECT candidate.value, candidate.ordinality
    FROM jsonb_array_elements(
      COALESCE(v_reservation.candidate_datetimes->'candidates', '[]'::jsonb)
    ) WITH ORDINALITY AS candidate(value, ordinality)
  LOOP
    v_normalized_candidate := v_candidate;
    v_raw := v_candidate->>'date';
    IF v_raw IS NOT NULL THEN
      BEGIN
        IF btrim(v_raw) ~ '^\d{4}-\d{2}-\d{2}$' THEN
          v_candidate_date := btrim(v_raw)::DATE;
        ELSE
          v_candidate_date := ((btrim(v_raw))::TIMESTAMPTZ AT TIME ZONE 'Asia/Tokyo')::DATE;
        END IF;
        v_normalized_candidate := jsonb_set(
          v_normalized_candidate,
          '{date}',
          to_jsonb(v_candidate_date::TEXT),
          true
        );
      EXCEPTION WHEN OTHERS THEN
        NULL;
      END;
    END IF;

    v_normalized_candidate := jsonb_set(
      v_normalized_candidate,
      '{status}',
      to_jsonb(
        CASE
          WHEN v_candidate_ordinal = v_selected_candidate_ordinal THEN 'confirmed'
          ELSE 'pending'
        END
      ),
      true
    );
    v_rebuilt_candidates := v_rebuilt_candidates || jsonb_build_array(v_normalized_candidate);
  END LOOP;

  v_confirmed_candidate_datetimes := jsonb_set(
    jsonb_set(
      COALESCE(v_reservation.candidate_datetimes, '{}'::JSONB),
      '{candidates}',
      v_rebuilt_candidates,
      true
    ),
    '{confirmedStore}',
    jsonb_build_object(
      'storeId', p_selected_store_id::TEXT,
      'storeName', v_store_name,
      'storeShortName', COALESCE(v_store_short_name, v_store_name)
    ),
    true
  );

  v_calendar_date := p_selected_date;
  v_schedule_time_slot := CASE v_candidate_time_slot
    WHEN 'morning' THEN '朝'
    WHEN 'afternoon' THEN '昼'
    ELSE '夜'
  END;

  -- block/unblockと全公演INSERTを直列化し、検査からINSERTまで同じ状態を維持する。
  LOCK TABLE schedule_blocked_slots IN SHARE MODE;
  LOCK TABLE schedule_events IN SHARE ROW EXCLUSIVE MODE;

  IF EXISTS (
    SELECT 1
    FROM schedule_blocked_slots blocked
    WHERE blocked.organization_id = v_org_id
      AND blocked.store_id = p_selected_store_id::TEXT
      AND blocked.date = v_calendar_date
      AND blocked.time_slot = v_candidate_time_slot
  ) THEN
    RAISE EXCEPTION 'PRIVATE_BOOKING_SLOT_BLOCKED:%:%', v_calendar_date, v_candidate_time_slot
      USING ERRCODE = 'P0040';
  END IF;

  IF v_existing_event_id IS NOT NULL THEN
    UPDATE schedule_events
    SET is_cancelled = true,
        updated_at = NOW()
    WHERE id = v_existing_event_id
      AND organization_id = v_org_id;
  END IF;

  -- メインGMの競合チェック（直接重複）
  PERFORM 1
  FROM schedule_events
  WHERE organization_id = v_org_id
    AND date = v_calendar_date
    AND is_cancelled = false
    AND v_gm_name = ANY(gms)
    AND start_time < p_selected_end_time
    AND end_time > p_selected_start_time
    AND id != COALESCE(v_existing_event_id, '00000000-0000-0000-0000-000000000000'::UUID)
  FOR UPDATE NOWAIT;

  IF FOUND THEN
    RAISE EXCEPTION 'GM_ALREADY_ASSIGNED' USING ERRCODE = 'P0025';
  END IF;

  -- サブGMの競合チェック（直接重複）
  IF v_sub_gm_name IS NOT NULL THEN
    PERFORM 1
    FROM schedule_events
    WHERE organization_id = v_org_id
      AND date = v_calendar_date
      AND is_cancelled = false
      AND v_sub_gm_name = ANY(gms)
      AND start_time < p_selected_end_time
      AND end_time > p_selected_start_time
      AND id != COALESCE(v_existing_event_id, '00000000-0000-0000-0000-000000000000'::UUID)
    FOR UPDATE NOWAIT;

    IF FOUND THEN
      RAISE EXCEPTION 'GM_ALREADY_ASSIGNED' USING ERRCODE = 'P0025';
    END IF;
  END IF;

  -- 店舗の直接重複チェック
  PERFORM 1
  FROM schedule_events
  WHERE organization_id = v_org_id
    AND date = v_calendar_date
    AND store_id = p_selected_store_id
    AND is_cancelled = false
    AND start_time < p_selected_end_time
    AND end_time > p_selected_start_time
    AND id != COALESCE(v_existing_event_id, '00000000-0000-0000-0000-000000000000'::UUID)
  FOR UPDATE NOWAIT;

  IF FOUND THEN
    RAISE EXCEPTION 'SLOT_ALREADY_OCCUPIED' USING ERRCODE = 'P0019';
  END IF;

  -- 店舗の60分インターバルチェック（設営・撤収時間の確保）
  PERFORM 1
  FROM schedule_events
  WHERE organization_id = v_org_id
    AND date = v_calendar_date
    AND store_id = p_selected_store_id
    AND is_cancelled = false
    AND start_time < p_selected_end_time + INTERVAL '60 minutes'
    AND end_time > p_selected_start_time - INTERVAL '60 minutes'
    AND id != COALESCE(v_existing_event_id, '00000000-0000-0000-0000-000000000000'::UUID)
  FOR UPDATE NOWAIT;

  IF FOUND THEN
    RAISE EXCEPTION 'INTERVAL_TOO_SHORT' USING ERRCODE = 'P0027';
  END IF;

  IF v_sub_gm_name IS NOT NULL THEN
    v_gms_array := ARRAY[v_gm_name, v_sub_gm_name];
    v_gm_roles := jsonb_build_object(v_gm_name, 'main', v_sub_gm_name, 'sub');
  ELSE
    v_gms_array := ARRAY[v_gm_name];
    v_gm_roles := '{}'::JSONB;
  END IF;

  INSERT INTO schedule_events (
    date,
    venue,
    scenario,
    start_time,
    end_time,
    start_at,
    end_at,
    store_id,
    gms,
    gm_roles,
    is_reservation_enabled,
    status,
    category,
    organization_id,
    reservation_id,
    reservation_name,
    is_reservation_name_overwritten,
    time_slot
  ) VALUES (
    v_calendar_date,
    v_store_name,
    p_scenario_title,
    p_selected_start_time,
    p_selected_end_time,
    (v_calendar_date + p_selected_start_time)::TIMESTAMPTZ,
    (v_calendar_date + p_selected_end_time)::TIMESTAMPTZ,
    p_selected_store_id,
    v_gms_array,
    v_gm_roles,
    false,
    'confirmed',
    'private',
    v_org_id,
    p_reservation_id,
    p_customer_name,
    false,
    v_schedule_time_slot
  )
  RETURNING id INTO v_schedule_event_id;

  UPDATE reservations
  SET
    status = 'confirmed',
    gm_staff = p_selected_gm_id,
    store_id = p_selected_store_id,
    schedule_event_id = v_schedule_event_id,
    candidate_datetimes = v_confirmed_candidate_datetimes,
    requested_datetime = (v_calendar_date::TEXT || ' ' || p_selected_start_time::TEXT)::TIMESTAMP WITH TIME ZONE,
    duration = EXTRACT(EPOCH FROM (p_selected_end_time - p_selected_start_time)) / 60,
    confirmed_by = COALESCE(v_caller_staff_id, confirmed_by),
    updated_at = NOW()
  WHERE id = p_reservation_id
    AND organization_id = v_org_id;

  GET DIAGNOSTICS v_updated_count = ROW_COUNT;
  IF v_updated_count <> 1 THEN
    RAISE EXCEPTION 'RESERVATION_UPDATE_FAILED' USING ERRCODE = 'P0024';
  END IF;

  IF v_private_group_id IS NOT NULL THEN
    UPDATE private_groups
    SET status = 'confirmed'
    WHERE id = v_private_group_id
      AND organization_id = v_org_id;
  END IF;

  RETURN v_schedule_event_id;
END;
$$;

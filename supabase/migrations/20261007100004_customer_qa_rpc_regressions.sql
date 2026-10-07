CREATE OR REPLACE FUNCTION public.create_reservation_with_lock_v2(p_schedule_event_id uuid, p_participant_count integer, p_customer_id uuid, p_customer_name text, p_customer_email text, p_customer_phone text, p_notes text DEFAULT NULL::text, p_how_found text DEFAULT NULL::text, p_reservation_number text DEFAULT NULL::text, p_customer_coupon_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_max_participants INTEGER;
  v_current_participants INTEGER;
  v_available_seats INTEGER;
  v_reservation_id UUID;

  v_event_org_id UUID;
  v_scenario_id UUID;
  v_org_scenario_id UUID;
  v_store_id UUID;
  v_date DATE;
  v_start_time TIME;
  v_duration INTEGER;
  v_title TEXT;

  v_customer_user_id UUID;
  v_customer_org_id UUID;
  v_caller_org_id UUID;
  v_is_admin BOOLEAN;
  v_is_staff BOOLEAN;

  v_participation_fee INTEGER;
  v_participation_costs JSONB;
  v_custom_holiday BOOLEAN;

  v_unit_price INTEGER;
  v_total_price INTEGER;
  v_discount_amount INTEGER := 0;
  v_final_price INTEGER;
  v_requested_datetime TIMESTAMP;
  v_reservation_number TEXT;

  v_coupon RECORD;
  v_campaign RECORD;
  v_coupon_usage_id UUID;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'UNAUTHORIZED' USING ERRCODE = 'P0011';
  END IF;

  IF p_participant_count <= 0 THEN
    RAISE EXCEPTION 'INVALID_PARTICIPANT_COUNT' USING ERRCODE = 'P0001';
  END IF;

  SELECT organization_id,
         scenario_id,
         organization_scenario_id,
         store_id,
         date,
         start_time,
         COALESCE(max_participants, capacity, 8)
  INTO v_event_org_id, v_scenario_id, v_org_scenario_id, v_store_id, v_date, v_start_time, v_max_participants
  FROM schedule_events
  WHERE id = p_schedule_event_id
    AND is_cancelled = false
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'EVENT_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  -- reservation_actor_auth_v1: 引数ではなくJWTの本人／対象組織の業務権限で判定。
  v_caller_org_id := public.get_user_organization_id();
  v_is_admin := COALESCE(public.reservation_actor_is_org_operator(v_event_org_id), false);
  v_is_staff := v_is_admin;

  -- 店舗の公演募集停止期間中は、お客様からの予約を受け付けない（スタッフの手入力は従来どおり可）
  IF NOT (v_is_admin OR v_is_staff)
     AND public.is_store_recruitment_paused(v_store_id, 'performance', v_date) THEN
    RAISE EXCEPTION 'RECRUITMENT_PAUSED' USING ERRCODE = 'P0046';
  END IF;

  IF p_customer_id IS NULL THEN
    IF NOT (v_is_admin OR v_is_staff) THEN
      RAISE EXCEPTION 'FORBIDDEN_STAFF_ONLY' USING ERRCODE = 'P0013';
    END IF;
    v_customer_user_id := NULL;
    v_customer_org_id := v_event_org_id;
  ELSE
    SELECT user_id, organization_id
    INTO v_customer_user_id, v_customer_org_id
    FROM public.customers
    WHERE id = p_customer_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'CUSTOMER_NOT_FOUND' USING ERRCODE = 'P0009';
    END IF;

    IF v_customer_user_id IS DISTINCT FROM auth.uid()
       AND NOT (v_is_admin OR v_is_staff) THEN
      RAISE EXCEPTION 'FORBIDDEN_CUSTOMER' USING ERRCODE = 'P0011';
    END IF;

    -- 本人の共通顧客は旧organization_idの有無を問わず組織横断で利用できる。
    -- 他人を代理する業務操作では、組織付き顧客は対象公演と同じ組織に限る。
    IF v_customer_org_id IS NOT NULL
       AND v_customer_org_id IS DISTINCT FROM v_event_org_id
       AND v_customer_user_id IS DISTINCT FROM auth.uid() THEN
      RAISE EXCEPTION 'CUSTOMER_ORG_MISMATCH' USING ERRCODE = 'P0012';
    END IF;
  END IF;

  IF NULLIF(btrim(p_reservation_number), '') IS NOT NULL THEN
    SELECT r.id INTO v_reservation_id FROM public.reservations r
    WHERE r.reservation_number=p_reservation_number AND r.organization_id=v_event_org_id
      AND r.schedule_event_id=p_schedule_event_id
      AND r.customer_id IS NOT DISTINCT FROM p_customer_id
      AND r.created_by=auth.uid() AND r.participant_count=p_participant_count
      AND r.status IN ('pending','confirmed','gm_confirmed','checked_in');
    IF FOUND THEN RETURN v_reservation_id; END IF;
    IF EXISTS(SELECT 1 FROM public.reservations r WHERE r.reservation_number=p_reservation_number) THEN
      RAISE EXCEPTION 'RESERVATION_RETRY_MISMATCH' USING ERRCODE='P0055';
    END IF;
  END IF;

  IF p_customer_id IS NOT NULL AND (p_customer_email IS NULL OR btrim(p_customer_email) !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' OR length(btrim(p_customer_email))>254) THEN
    RAISE EXCEPTION '有効なメールアドレスを入力してください' USING ERRCODE='P0021';
  END IF;

  SELECT COALESCE(SUM(participant_count), 0)
  INTO v_current_participants
  FROM reservations
  WHERE schedule_event_id = p_schedule_event_id
    AND status IN ('pending', 'confirmed', 'gm_confirmed', 'checked_in');

  v_available_seats := v_max_participants - v_current_participants;

  IF v_available_seats <= 0 THEN
    RAISE EXCEPTION 'SOLD_OUT' USING ERRCODE = 'P0003';
  END IF;

  IF p_participant_count > v_available_seats THEN
    RAISE EXCEPTION 'INSUFFICIENT_SEATS' USING ERRCODE = 'P0004';
  END IF;

  IF v_org_scenario_id IS NOT NULL THEN
    SELECT
      os.participation_fee,
      os.participation_costs,
      COALESCE(os.duration, sm.official_duration),
      COALESCE(os.override_title, sm.title)
    INTO v_participation_fee, v_participation_costs, v_duration, v_title
    FROM organization_scenarios os
    JOIN scenario_masters sm ON sm.id = os.scenario_master_id
    WHERE os.id = v_org_scenario_id;
  ELSIF v_scenario_id IS NOT NULL THEN
    SELECT participation_fee, participation_costs, duration, title
    INTO v_participation_fee, v_participation_costs, v_duration, v_title
    FROM scenarios_v2
    WHERE id = v_scenario_id;

    IF NOT FOUND THEN
      SELECT participation_fee, participation_costs, duration, title
      INTO v_participation_fee, v_participation_costs, v_duration, v_title
      FROM scenarios
      WHERE id = v_scenario_id;
    END IF;
  END IF;

  IF v_participation_fee IS NULL AND v_title IS NULL THEN
    RAISE EXCEPTION 'SCENARIO_NOT_FOUND' USING ERRCODE = 'P0017';
  END IF;

  SELECT COALESCE(bool_or(COALESCE(os.custom_holidays, '[]'::JSONB) ? v_date::TEXT), FALSE)
  INTO v_custom_holiday
  FROM organization_settings os
  WHERE os.organization_id = v_event_org_id;

  v_unit_price := public.calculate_booking_participation_fee(
    v_participation_fee, v_participation_costs, v_date, v_start_time, v_custom_holiday
  );

  v_total_price := v_unit_price * p_participant_count;

  IF p_customer_coupon_id IS NOT NULL THEN
    v_discount_amount := public.coupon_discount_for_event(
      p_customer_coupon_id, p_schedule_event_id, v_total_price, p_customer_id, NULL);
  END IF;

  v_final_price := v_total_price - v_discount_amount;
  v_requested_datetime := (v_date + v_start_time)::TIMESTAMP;

  IF p_reservation_number IS NULL OR length(trim(p_reservation_number)) = 0 THEN
    v_reservation_number := to_char(now(), 'YYMMDD') || '-' || upper(substr(md5(random()::text), 1, 4));
  ELSE
    v_reservation_number := p_reservation_number;
  END IF;

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
    COALESCE(v_scenario_id, v_org_scenario_id),
    v_store_id,
    p_customer_id,
    p_customer_name,
    p_customer_email,
    p_customer_phone,
    v_requested_datetime,
    v_duration,
    p_participant_count,
    ARRAY[]::text[],
    v_total_price,
    0,
    v_total_price,
    v_discount_amount,
    v_final_price,
    v_unit_price,
    CASE WHEN p_customer_id IS NULL THEN 'staff' ELSE 'onsite' END,
    'pending',
    'confirmed',
    p_notes,
    v_reservation_number,
    auth.uid(),
    v_event_org_id,
    COALESCE(v_title, '')
  )
  RETURNING id INTO v_reservation_id;

  IF p_customer_coupon_id IS NOT NULL AND v_discount_amount > 0 THEN
    INSERT INTO coupon_usages (
      customer_coupon_id,
      reservation_id,
      discount_amount
    ) VALUES (
      p_customer_coupon_id,
      v_reservation_id,
      v_discount_amount
    )
    RETURNING id INTO v_coupon_usage_id;

    UPDATE reservations SET coupon_usage_id = v_coupon_usage_id WHERE id = v_reservation_id;

  END IF;

  -- current_participants は reservations INSERT 後の recalc トリガーが絶対値で再計算する。
  -- checked_in を含まない手動 += はトリガー結果を過小上書きするため削除。

  RETURN v_reservation_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.create_private_booking_request(p_scenario_id uuid, p_customer_id uuid, p_customer_name text, p_customer_email text, p_customer_phone text, p_participant_count integer, p_candidate_datetimes jsonb, p_notes text DEFAULT NULL::text, p_reservation_number text DEFAULT NULL::text, p_private_group_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_scenario_title TEXT;
  v_duration INTEGER;
  v_participation_fee NUMERIC;
  v_total_price NUMERIC;
  v_participation_costs JSONB;
  v_custom_holidays JSONB;
  v_unit_price INTEGER;
  v_pricing_date DATE := (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Tokyo')::DATE;
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
  v_accepts_private_booking BOOLEAN;
  v_player_count_min INTEGER;
  v_player_count_max INTEGER;
  v_scenario_kind TEXT;
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

  IF p_customer_email IS NULL OR btrim(p_customer_email) !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' OR length(btrim(p_customer_email))>254 THEN
    RAISE EXCEPTION '有効なメールアドレスを入力してください' USING ERRCODE='P0021';
  END IF;
  IF p_customer_phone IS NULL OR regexp_replace(p_customer_phone,'[-[:space:]]','','g') !~ '^[0-9]{10,11}$' THEN
    RAISE EXCEPTION '電話番号は10〜11桁で入力してください' USING ERRCODE='P0022';
  END IF;

  -- 貸切リクエストは必ずグループから申し込む（画面は送信前にグループを作る）。#834 #842
  -- 本人確認（P0401）の後に判定する。店舗の誤りと区別できるよう専用のコード P0047 を使う。
  IF p_private_group_id IS NULL THEN
    RAISE EXCEPTION '貸切リクエストはグループから申し込んでください' USING ERRCODE = 'P0047';
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
    os.participation_fee, os.participation_costs,
    os.organization_id,
    os.scenario_master_id
  INTO
    v_scenario_title, v_duration, v_participation_fee, v_participation_costs, v_row_org_id, v_scenario_master_id
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
      os.participation_fee, os.participation_costs,
      os.scenario_master_id
    INTO
      v_scenario_title, v_duration, v_participation_fee, v_participation_costs, v_scenario_master_id
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
        os.participation_fee, os.participation_costs,
        os.organization_id,
        os.scenario_master_id
      INTO
        v_scenario_title, v_duration, v_participation_fee, v_participation_costs, v_row_org_id, v_scenario_master_id
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
    SELECT title, duration, participation_fee, participation_costs
    INTO v_scenario_title, v_duration, v_participation_fee, v_participation_costs
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

  SELECT COALESCE(os.custom_holidays, '[]'::JSONB) INTO v_custom_holidays
  FROM organization_settings os WHERE os.organization_id = v_org_id;
  v_custom_holidays := COALESCE(v_custom_holidays, '[]'::JSONB);

  -- 貸切受付OFF / 出張限定（offsite_only）は顧客リクエストを拒否する
  SELECT
    COALESCE(os.accepts_private_booking, true),
    COALESCE(os.scenario_kind, 'regular')
  INTO
    v_accepts_private_booking,
    v_scenario_kind
  FROM organization_scenarios os
  WHERE os.organization_id = v_org_id
    AND (
      os.id = p_scenario_id
      OR os.scenario_master_id = COALESCE(v_scenario_master_id, p_scenario_id)
    )
  ORDER BY
    CASE WHEN os.id = p_scenario_id THEN 0 ELSE 1 END,
    os.created_at
  LIMIT 1;

  IF FOUND AND (
    v_accepts_private_booking IS FALSE
    OR v_scenario_kind = 'offsite_only'
  ) THEN
    RAISE EXCEPTION 'PRIVATE_BOOKING_NOT_ACCEPTED' USING ERRCODE = 'P0044';
  END IF;

  -- 店舗側の不要な人数制限ではなく、導入作品の実効プレイ人数を検証する。
  SELECT COALESCE(os.override_player_count_min,sm.player_count_min),
         COALESCE(os.override_player_count_max,sm.player_count_max)
    INTO v_player_count_min,v_player_count_max
  FROM public.organization_scenarios os
  JOIN public.scenario_masters sm ON sm.id=os.scenario_master_id
  WHERE os.organization_id=v_org_id AND os.scenario_master_id=v_scenario_master_id;
  IF NOT FOUND OR v_player_count_min IS NULL OR v_player_count_max IS NULL
     OR v_player_count_min<1 OR v_player_count_max<v_player_count_min THEN
    RAISE EXCEPTION 'PRIVATE_BOOKING_PLAYER_COUNT_NOT_CONFIGURED' USING ERRCODE='P0051';
  END IF;
  IF p_participant_count IS NULL OR p_participant_count<v_player_count_min OR p_participant_count>v_player_count_max THEN
    RAISE EXCEPTION 'Participant count must be between % and %',v_player_count_min,v_player_count_max USING ERRCODE='P0025';
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

    v_unit_price := public.calculate_booking_participation_fee(
      v_participation_fee::INTEGER, v_participation_costs, v_cand_date, v_cand_start,
      v_custom_holidays ? v_cand_date::TEXT, v_pricing_date
    );

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
        'status', 'pending',
        'unitPrice', v_unit_price,
        'totalPrice', v_unit_price * p_participant_count
      )
    );
  END LOOP;

  v_trusted_candidate_datetimes := jsonb_build_object(
    'candidates', v_trusted_candidates,
    'requestedStores', v_trusted_requested_stores
  );

  -- block/unblock・公演追加との競合を直列化し、同一transactionの最新状態で判定する。
  LOCK TABLE schedule_blocked_slots IN SHARE MODE;
  -- 店舗の募集停止期間の追加・削除とも直列化する（#696）。保存側は単発の書き込みなので行き詰まりは起きない。
  LOCK TABLE public.store_recruitment_pauses IN SHARE MODE;
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
      ) OR public.is_store_recruitment_paused(v_store_uuid, 'private', v_cand_date) THEN
        v_blocked_store_count := v_blocked_store_count + 1;
        CONTINUE;
      END IF;

      IF EXISTS (
        SELECT 1
        FROM schedule_events event
        WHERE event.organization_id = v_org_id
          AND event.store_id = v_store_uuid
          AND event.date BETWEEN v_cand_date - 2 AND v_cand_date + 2
          AND event.is_cancelled = false
          AND event.date + event.start_time < v_cand_date + v_cand_end + CASE WHEN v_cand_end < v_cand_start THEN interval '1 day' ELSE interval '0 days' END + make_interval(mins => public.resolve_preparation_minutes(v_org_id,NULL,NULL,event.id))
          AND event.date + event.end_time + CASE WHEN event.end_time < event.start_time THEN interval '1 day' ELSE interval '0 days' END > v_cand_date + v_cand_start - make_interval(mins => public.resolve_preparation_minutes(v_org_id,v_store_uuid,COALESCE(v_scenario_master_id,p_scenario_id),NULL))
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
  v_unit_price := (v_trusted_candidate_datetimes->'candidates'->0->>'unitPrice')::INTEGER;
  v_total_price := p_participant_count * v_unit_price;

  -- 最初の候補日時を取得
  v_first_candidate := v_trusted_candidate_datetimes->'candidates'->0;
  v_requested_datetime := (
    (v_first_candidate->>'date') || 'T' ||
    COALESCE(v_first_candidate->>'startTime', '10:00') ||
    '+09:00'
  )::TIMESTAMPTZ;

  IF v_scenario_master_id IS NULL THEN
    RAISE EXCEPTION 'Scenario master not resolved: %', p_scenario_id USING ERRCODE = 'P0001';
  END IF;

  -- 予約を作成
  INSERT INTO reservations (
    title,
    reservation_number,
    scenario_id,
    scenario_master_id,
    customer_id,
    requested_datetime,
    duration,
    participant_count,
    total_price, base_price, final_price, unit_price,
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
    v_scenario_master_id,
    v_scenario_master_id,
    p_customer_id,
    v_requested_datetime,
    v_duration,
    p_participant_count,
    v_total_price, v_total_price, v_total_price, v_unit_price,
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

  INSERT INTO public.private_booking_pricing_snapshots(
    reservation_id, organization_id, base_fee, participation_costs, custom_holidays, pricing_date
  ) VALUES (
    v_reservation_id, v_org_id, v_participation_fee::INTEGER,
    COALESCE(v_participation_costs, '[]'::JSONB), v_custom_holidays, v_pricing_date
  );

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
    WHERE ssa.scenario_master_id = v_scenario_master_id
      AND ssa.organization_id = v_org_id
      AND (ssa.can_main_gm = true OR ssa.can_sub_gm = true)
      AND s.organization_id = v_org_id
      AND s.status = 'active'
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
$function$;

CREATE OR REPLACE FUNCTION public.private_group_read_snapshot(p_group_id uuid DEFAULT NULL::uuid, p_invite_code text DEFAULT NULL::text, p_member_id uuid DEFAULT NULL::uuid, p_guest_token text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE g public.private_groups%ROWTYPE; access_level text; invited boolean:=false;
 result jsonb; members jsonb:='[]'; dates jsonb:='[]'; scenario jsonb; actor_member uuid;
 reservation_status text; confirmed_name text; confirmed_performance jsonb;
BEGIN
 IF p_invite_code IS NOT NULL THEN
  SELECT * INTO g FROM public.private_groups WHERE invite_code=p_invite_code AND (p_group_id IS NULL OR id=p_group_id);
  invited:=FOUND;
 ELSE
  SELECT * INTO g FROM public.private_groups WHERE id=p_group_id;
 END IF;
 IF g.id IS NULL THEN RAISE EXCEPTION 'グループを閲覧できません' USING ERRCODE='42501'; END IF;
 BEGIN
  access_level:=public.authorize_private_group_read(g.id,p_member_id,p_guest_token);
 EXCEPTION WHEN insufficient_privilege THEN
  IF NOT invited THEN RAISE; END IF;
  access_level:='preview';
 END;
 IF access_level<>'preview' THEN
  SELECT id INTO actor_member FROM public.private_group_members
   WHERE group_id=g.id AND status='joined'
   AND auth.uid() IS NOT NULL AND user_id=auth.uid()
   ORDER BY id LIMIT 1;
  IF actor_member IS NULL AND p_member_id IS NOT NULL THEN
   BEGIN
    PERFORM public.require_private_group_member(g.id,p_member_id,p_guest_token);
    actor_member:=p_member_id;
   EXCEPTION WHEN insufficient_privilege THEN NULL;
   END;
  END IF;
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
   'id',m.id,'group_id',m.group_id,'user_id',m.user_id,
   'guest_name',CASE WHEN m.user_id IS NULL THEN m.guest_name ELSE COALESCE((SELECT NULLIF(c.nickname,'') FROM public.customers c WHERE c.user_id=m.user_id ORDER BY c.id LIMIT 1),'ニックネーム未設定') END,
   'staff_display_name',CASE WHEN access_level='staff' THEN COALESCE((SELECT COALESCE(NULLIF(c.nickname,''),NULLIF(c.name,'')) FROM public.customers c WHERE c.user_id=m.user_id ORDER BY c.id LIMIT 1),m.guest_name,'参加者') END,
   'guest_email',CASE WHEN access_level IN ('staff','organizer') OR m.id=actor_member THEN m.guest_email END,
   'guest_phone',CASE WHEN access_level IN ('staff','organizer') OR m.id=actor_member THEN m.guest_phone END,
   'is_organizer',m.is_organizer,'status',m.status,'joined_at',m.joined_at,'created_at',m.created_at,
   'coupon_id',CASE WHEN access_level IN ('staff','organizer') OR m.id=actor_member THEN m.coupon_id END,
   'payment_amount',CASE WHEN access_level IN ('staff','organizer') OR m.id=actor_member THEN m.payment_amount END,
   'coupon_discount',CASE WHEN access_level IN ('staff','organizer') OR m.id=actor_member THEN m.coupon_discount END,
   'final_amount',CASE WHEN access_level IN ('staff','organizer') OR m.id=actor_member THEN m.final_amount END,
   'payment_status',CASE WHEN access_level IN ('staff','organizer') OR m.id=actor_member THEN m.payment_status END,
   'date_responses',COALESCE((SELECT jsonb_agg(to_jsonb(r) ORDER BY r.id) FROM public.private_group_date_responses r WHERE r.group_id=g.id AND r.member_id=m.id),'[]'::jsonb)
  ) ORDER BY m.joined_at,m.id),'[]'::jsonb) INTO members FROM public.private_group_members m WHERE m.group_id=g.id;
  SELECT r.status,s.name INTO reservation_status,confirmed_name FROM public.reservations r LEFT JOIN public.staff s ON s.id=r.confirmed_by AND s.organization_id=g.organization_id WHERE r.id=g.reservation_id AND r.organization_id=g.organization_id;
  -- Only authorized members/staff receive the current confirmed performance.
  -- Proposed candidate rows remain immutable history for availability answers.
  SELECT jsonb_build_object('id',e.id,'date',e.date,'start_time',e.start_time,'end_time',e.end_time,
    'store_name',COALESCE(s.name,e.venue)) INTO confirmed_performance
  FROM public.reservations r JOIN public.schedule_events e ON e.id=r.schedule_event_id AND e.organization_id=g.organization_id
  LEFT JOIN public.stores s ON s.id=e.store_id AND s.organization_id=g.organization_id
  WHERE r.id=g.reservation_id AND r.organization_id=g.organization_id
    AND r.status IN ('confirmed','checked_in','completed','no_show') AND NOT COALESCE(e.is_cancelled,false);
 END IF;
 SELECT COALESCE(jsonb_agg(to_jsonb(d)||jsonb_build_object('responses',CASE WHEN access_level='preview' THEN '[]'::jsonb ELSE COALESCE((SELECT jsonb_agg(to_jsonb(r) ORDER BY r.id) FROM public.private_group_date_responses r WHERE r.group_id=g.id AND r.candidate_date_id=d.id),'[]'::jsonb) END) ORDER BY d.order_num,d.id),'[]'::jsonb)
 INTO dates FROM public.private_group_candidate_dates d WHERE d.group_id=g.id;
 SELECT jsonb_build_object('id',s.id,'title',s.title,'key_visual_url',s.key_visual_url,'player_count_min',s.player_count_min,'player_count_max',s.player_count_max) INTO scenario FROM public.scenario_masters s WHERE s.id=g.scenario_master_id;
 IF scenario IS NOT NULL THEN
  SELECT scenario||jsonb_build_object('characters',CASE WHEN access_level='preview' THEN NULL ELSE v.characters END,'effective_player_count_min',v.player_count_min,'effective_player_count_max',v.player_count_max,'survey_enabled',COALESCE(v.survey_enabled,false)) INTO result FROM public.organization_scenarios_with_master v WHERE v.organization_id=g.organization_id AND v.scenario_master_id=g.scenario_master_id;
  scenario:=COALESCE(result,scenario);
 END IF;
 result:=jsonb_build_object('id',g.id,'organization_id',g.organization_id,'scenario_master_id',g.scenario_master_id,
  'organizer_id',CASE WHEN access_level<>'preview' THEN g.organizer_id END,
  -- グループの同組織スタッフ認可後に、幹事本人の最小表示名だけを返す。
  -- 顧客プロフィールは共通(NULL組織)もあるため所属では絞らない。
  'organizer_display_name',CASE WHEN access_level='staff' THEN COALESCE((
    SELECT COALESCE(NULLIF(c.nickname,''),NULLIF(c.name,''))
    FROM public.customers c WHERE c.user_id=g.organizer_id
    ORDER BY c.id LIMIT 1
  ),(
    SELECT NULLIF(m.guest_name,'') FROM public.private_group_members m
    WHERE m.group_id=g.id AND m.user_id=g.organizer_id
    ORDER BY m.is_organizer DESC NULLS LAST,m.id LIMIT 1
  )) END,
  'name',g.name,'invite_code',g.invite_code,'status',g.status,
  'joined_member_count',(SELECT count(*) FROM public.private_group_members m WHERE m.group_id=g.id AND m.status='joined'),
  'reservation_id',CASE WHEN access_level<>'preview' THEN g.reservation_id END,'target_participant_count',g.target_participant_count,'preferred_store_ids',g.preferred_store_ids,
  'notes',CASE WHEN access_level IN ('staff','organizer') THEN g.notes END,'created_at',g.created_at,'updated_at',g.updated_at,
  'total_price',g.total_price,'per_person_price',g.per_person_price,
  'character_assignments',CASE WHEN access_level<>'preview' THEN g.character_assignments END,
  'character_assignment_method',CASE WHEN access_level<>'preview' THEN g.character_assignment_method END,
  'scenario_masters',scenario,'members',members,'candidate_dates',dates,'confirmed_performance',confirmed_performance,'confirmed_performance_access',CASE WHEN access_level='preview' THEN 'preview' ELSE 'authorized' END);
 RETURN jsonb_build_object('group',result,'access_level',access_level,'current_member_id',actor_member,'linked_reservation_status',reservation_status,'confirmed_by_name',confirmed_name);
END $function$;

CREATE OR REPLACE FUNCTION public.assert_private_booking_candidate_date(p_org uuid, p_scenario uuid, p_date date)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE days INTEGER; today DATE := (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Tokyo')::DATE; period RECORD;
BEGIN
 IF p_org IS NULL OR p_scenario IS NULL OR p_date IS NULL THEN RAISE EXCEPTION 'PRIVATE_BOOKING_CONTEXT_REQUIRED' USING ERRCODE='P0045'; END IF;
 days := public.get_effective_private_booking_deadline_days(p_org,NULL,p_scenario);
 IF p_date < today + days THEN
   RAISE EXCEPTION 'PRIVATE_BOOKING_DEADLINE_PASSED' USING ERRCODE='P0045';
 END IF;
 -- 作品編集の「貸切募集期間」（申し込める期間）と「公演期間」（公演できる日の範囲）。未設定は制限なし。
 SELECT os.booking_start_date,os.booking_end_date,os.available_from,os.available_until INTO period
 FROM public.organization_scenarios os
 WHERE os.organization_id=p_org AND (os.id=p_scenario OR os.scenario_master_id=p_scenario OR os.scenario_master_id=(SELECT legacy.scenario_master_id FROM public.scenarios legacy WHERE legacy.id=p_scenario AND legacy.organization_id=p_org))
 ORDER BY CASE WHEN os.id=p_scenario THEN 0 ELSE 1 END,os.created_at LIMIT 1;
 IF FOUND THEN
   IF (period.booking_start_date IS NOT NULL AND today < period.booking_start_date)
      OR (period.booking_end_date IS NOT NULL AND today > period.booking_end_date) THEN
     RAISE EXCEPTION 'PRIVATE_BOOKING_NOT_ACCEPTED' USING ERRCODE='P0044';
   END IF;
   IF (period.available_from IS NOT NULL AND p_date < period.available_from)
      OR (period.available_until IS NOT NULL AND p_date > period.available_until) THEN
     RAISE EXCEPTION 'PRIVATE_BOOKING_OUTSIDE_PERFORMANCE_PERIOD' USING ERRCODE='P0054';
   END IF;
 END IF;
END;
$function$;

NOTIFY pgrst,'reload schema';

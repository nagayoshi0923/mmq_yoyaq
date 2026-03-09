-- =============================================================================
-- マイグレーション: create_reservation_with_lock_v2 で customer_id NULL を許容
-- =============================================================================
-- 
-- 作成日: 2026-03-10
-- 
-- 問題:
--   スタッフが管理画面から顧客なしで予約を追加しようとすると
--   CUSTOMER_NOT_FOUND エラーが発生
-- 
-- 解決:
--   p_customer_id が NULL の場合は顧客検証をスキップし、
--   スタッフ/管理者権限のみチェックする
-- 
-- =============================================================================

-- 既存の関数を削除
DO $$
DECLARE
  func_record RECORD;
BEGIN
  FOR func_record IN 
    SELECT p.oid::regprocedure::text as func_sig
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public' AND p.proname = 'create_reservation_with_lock_v2'
  LOOP
    EXECUTE 'DROP FUNCTION IF EXISTS ' || func_record.func_sig || ' CASCADE';
  END LOOP;
  
  FOR func_record IN 
    SELECT p.oid::regprocedure::text as func_sig
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public' AND p.proname = 'create_reservation_with_lock'
  LOOP
    EXECUTE 'DROP FUNCTION IF EXISTS ' || func_record.func_sig || ' CASCADE';
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION create_reservation_with_lock_v2(
  p_schedule_event_id UUID,
  p_participant_count INTEGER,
  p_customer_id UUID,
  p_customer_name TEXT,
  p_customer_email TEXT,
  p_customer_phone TEXT,
  p_notes TEXT DEFAULT NULL,
  p_how_found TEXT DEFAULT NULL,
  p_reservation_number TEXT DEFAULT NULL,
  p_customer_coupon_id UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
  v_time_slot TEXT;
  v_time_slot_cost JSONB;

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
  IF p_participant_count <= 0 THEN
    RAISE EXCEPTION 'INVALID_PARTICIPANT_COUNT' USING ERRCODE = 'P0001';
  END IF;

  -- 公演行をロック + 組織/定員を取得
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

  -- 認可チェック
  v_caller_org_id := get_user_organization_id();
  v_is_admin := is_org_admin();
  v_is_staff := EXISTS (
    SELECT 1 FROM staff 
    WHERE user_id = auth.uid() 
      AND organization_id = v_event_org_id 
      AND status = 'active'
  );

  -- p_customer_id が NULL の場合（スタッフ予約）
  IF p_customer_id IS NULL THEN
    -- 管理者またはスタッフのみ許可
    IF NOT (v_is_admin OR v_is_staff) THEN
      RAISE EXCEPTION 'FORBIDDEN_STAFF_ONLY' USING ERRCODE = 'P0013';
    END IF;
    -- 組織チェック
    IF v_caller_org_id IS NOT NULL AND v_caller_org_id != v_event_org_id THEN
      RAISE EXCEPTION 'FORBIDDEN_ORG' USING ERRCODE = 'P0010';
    END IF;
    v_customer_user_id := NULL;
    v_customer_org_id := v_event_org_id;
  ELSE
    -- 顧客情報を取得
    SELECT user_id, organization_id
    INTO v_customer_user_id, v_customer_org_id
    FROM customers
    WHERE id = p_customer_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'CUSTOMER_NOT_FOUND' USING ERRCODE = 'P0009';
    END IF;

    -- 認可チェック
    IF v_is_admin THEN
      NULL;
    ELSIF v_is_staff THEN
      IF v_caller_org_id != v_event_org_id THEN
        RAISE EXCEPTION 'FORBIDDEN_ORG' USING ERRCODE = 'P0010';
      END IF;
    ELSIF v_caller_org_id IS NOT NULL THEN
      IF v_caller_org_id != v_event_org_id THEN
        RAISE EXCEPTION 'FORBIDDEN_ORG' USING ERRCODE = 'P0010';
      END IF;
    ELSE
      IF v_customer_user_id IS DISTINCT FROM auth.uid() THEN
        RAISE EXCEPTION 'FORBIDDEN_CUSTOMER' USING ERRCODE = 'P0011';
      END IF;
    END IF;

    IF v_customer_org_id IS DISTINCT FROM v_event_org_id THEN
      RAISE EXCEPTION 'CUSTOMER_ORG_MISMATCH' USING ERRCODE = 'P0012';
    END IF;
  END IF;

  -- 在庫チェック
  SELECT COALESCE(SUM(participant_count), 0)
  INTO v_current_participants
  FROM reservations
  WHERE schedule_event_id = p_schedule_event_id
    AND status IN ('pending', 'confirmed', 'gm_confirmed');

  v_available_seats := v_max_participants - v_current_participants;

  IF v_available_seats <= 0 THEN
    RAISE EXCEPTION 'SOLD_OUT' USING ERRCODE = 'P0003';
  END IF;

  IF p_participant_count > v_available_seats THEN
    RAISE EXCEPTION 'INSUFFICIENT_SEATS' USING ERRCODE = 'P0004';
  END IF;

  -- 料金計算
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

  -- time_slot 判定
  IF EXTRACT(HOUR FROM v_start_time) < 12 THEN
    v_time_slot := 'morning';
  ELSIF EXTRACT(HOUR FROM v_start_time) < 18 THEN
    v_time_slot := 'afternoon';
  ELSE
    v_time_slot := 'evening';
  END IF;

  v_time_slot_cost := NULL;
  IF v_participation_costs IS NOT NULL AND jsonb_typeof(v_participation_costs) = 'array' THEN
    SELECT elem
    INTO v_time_slot_cost
    FROM jsonb_array_elements(v_participation_costs) elem
    WHERE COALESCE(elem->>'status', 'active') = 'active'
      AND elem->>'time_slot' = v_time_slot
    LIMIT 1;

    IF v_time_slot_cost IS NULL THEN
      SELECT elem
      INTO v_time_slot_cost
      FROM jsonb_array_elements(v_participation_costs) elem
      WHERE COALESCE(elem->>'status', 'active') = 'active'
        AND elem->>'time_slot' = '通常'
      LIMIT 1;
    END IF;
  END IF;

  IF v_time_slot_cost IS NOT NULL THEN
    IF v_time_slot_cost->>'type' = 'percentage' THEN
      IF v_participation_fee IS NULL THEN
        RAISE EXCEPTION 'SCENARIO_FEE_NOT_FOUND' USING ERRCODE = 'P0017';
      END IF;
      v_unit_price := ROUND(v_participation_fee * (1 + (COALESCE((v_time_slot_cost->>'amount')::NUMERIC, 0) / 100)))::INTEGER;
    ELSE
      v_unit_price := COALESCE((v_time_slot_cost->>'amount')::INTEGER, NULL);
    END IF;
  ELSE
    v_unit_price := v_participation_fee;
  END IF;

  IF v_unit_price IS NULL THEN
    RAISE EXCEPTION 'SCENARIO_FEE_NOT_FOUND' USING ERRCODE = 'P0017';
  END IF;

  v_total_price := v_unit_price * p_participant_count;

  -- クーポン検証・適用
  IF p_customer_coupon_id IS NOT NULL THEN
    SELECT cc.*
    INTO v_coupon
    FROM customer_coupons cc
    WHERE cc.id = p_customer_coupon_id
      AND cc.customer_id = p_customer_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'COUPON_NOT_FOUND: 指定されたクーポンが見つかりません' USING ERRCODE = 'P0020';
    END IF;

    IF v_coupon.status != 'active' THEN
      RAISE EXCEPTION 'COUPON_NOT_ACTIVE: このクーポンは利用できません（ステータス: %）', v_coupon.status USING ERRCODE = 'P0021';
    END IF;

    IF v_coupon.uses_remaining <= 0 THEN
      RAISE EXCEPTION 'COUPON_EXHAUSTED: このクーポンの利用回数を超えています' USING ERRCODE = 'P0022';
    END IF;

    IF v_coupon.expires_at IS NOT NULL AND v_coupon.expires_at < now() THEN
      UPDATE customer_coupons SET status = 'expired' WHERE id = v_coupon.id;
      RAISE EXCEPTION 'COUPON_EXPIRED: このクーポンは有効期限を過ぎています' USING ERRCODE = 'P0023';
    END IF;

    SELECT camp.*
    INTO v_campaign
    FROM coupon_campaigns camp
    WHERE camp.id = v_coupon.campaign_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'CAMPAIGN_NOT_FOUND: キャンペーン情報が見つかりません' USING ERRCODE = 'P0024';
    END IF;

    IF NOT v_campaign.is_active THEN
      RAISE EXCEPTION 'CAMPAIGN_INACTIVE: このキャンペーンは終了しています' USING ERRCODE = 'P0025';
    END IF;

    IF v_campaign.valid_from IS NOT NULL AND v_campaign.valid_from > now() THEN
      RAISE EXCEPTION 'CAMPAIGN_NOT_STARTED: このキャンペーンはまだ開始されていません' USING ERRCODE = 'P0026';
    END IF;

    IF v_campaign.valid_until IS NOT NULL AND v_campaign.valid_until < now() THEN
      RAISE EXCEPTION 'CAMPAIGN_ENDED: このキャンペーンは終了しています' USING ERRCODE = 'P0027';
    END IF;

    IF v_campaign.target_type = 'specific_organization' THEN
      IF NOT (v_event_org_id = ANY(v_campaign.target_ids)) THEN
        RAISE EXCEPTION 'COUPON_NOT_APPLICABLE: このクーポンはこの組織の予約には使用できません' USING ERRCODE = 'P0028';
      END IF;
    ELSIF v_campaign.target_type = 'specific_scenarios' THEN
      IF NOT (COALESCE(v_scenario_id, v_org_scenario_id) = ANY(v_campaign.target_ids)) THEN
        RAISE EXCEPTION 'COUPON_NOT_APPLICABLE: このクーポンはこのシナリオの予約には使用できません' USING ERRCODE = 'P0028';
      END IF;
    END IF;

    IF v_campaign.discount_type = 'fixed' THEN
      v_discount_amount := v_campaign.discount_amount;
    ELSIF v_campaign.discount_type = 'percentage' THEN
      v_discount_amount := ROUND(v_total_price * v_campaign.discount_amount / 100.0)::INTEGER;
    END IF;

    IF v_discount_amount > v_total_price THEN
      v_discount_amount := v_total_price;
    END IF;
  END IF;

  v_final_price := v_total_price - v_discount_amount;

  v_requested_datetime := (v_date + v_start_time)::TIMESTAMP;

  IF p_reservation_number IS NULL OR length(trim(p_reservation_number)) = 0 THEN
    v_reservation_number := to_char(now(), 'YYMMDD') || '-' || upper(substr(md5(random()::text), 1, 4));
  ELSE
    v_reservation_number := p_reservation_number;
  END IF;

  -- 予約を挿入
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
    p_customer_id,  -- NULL の場合は NULL のまま
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

  -- クーポン使用記録
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

    UPDATE customer_coupons
    SET uses_remaining = uses_remaining - 1,
        status = CASE WHEN uses_remaining - 1 <= 0 THEN 'fully_used' ELSE 'active' END
    WHERE id = p_customer_coupon_id;
  END IF;

  -- current_participants を更新
  UPDATE schedule_events
  SET current_participants = v_current_participants + p_participant_count
  WHERE id = p_schedule_event_id;

  RETURN v_reservation_id;
END;
$$;

GRANT EXECUTE ON FUNCTION create_reservation_with_lock_v2(UUID, INTEGER, UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, UUID) TO authenticated;

-- 旧版ラッパー
CREATE OR REPLACE FUNCTION create_reservation_with_lock(
  p_schedule_event_id UUID,
  p_participant_count INTEGER,
  p_customer_id UUID,
  p_customer_name TEXT,
  p_customer_email TEXT,
  p_customer_phone TEXT,
  p_notes TEXT DEFAULT NULL,
  p_how_found TEXT DEFAULT NULL,
  p_reservation_number TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN create_reservation_with_lock_v2(
    p_schedule_event_id,
    p_participant_count,
    p_customer_id,
    p_customer_name,
    p_customer_email,
    p_customer_phone,
    p_notes,
    p_how_found,
    p_reservation_number,
    NULL
  );
END;
$$;

GRANT EXECUTE ON FUNCTION create_reservation_with_lock(UUID, INTEGER, UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) TO authenticated;

DO $$ 
BEGIN
  RAISE NOTICE '✅ マイグレーション完了: create_reservation_with_lock_v2 で customer_id NULL を許容';
END $$;

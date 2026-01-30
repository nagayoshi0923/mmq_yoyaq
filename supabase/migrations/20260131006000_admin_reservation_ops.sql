-- 管理/運用向け: reservations の更新/削除を RPC 経由に統一（lint: no-restricted-syntax 対応）
-- 目的:
-- - フロントからの reservations 直UPDATE/DELETEを禁止しつつ、必要な運用操作は RPC に集約する
-- - マルチテナント（organization_id）と権限（admin/staff）をDB側で強制する

BEGIN;

-- 1) reservations を限定的に更新（admin/staff のみ）
CREATE OR REPLACE FUNCTION public.admin_update_reservation_fields(
  p_reservation_id UUID,
  p_updates JSONB
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_reservation_org_id UUID;
  v_caller_org_id UUID;
  v_is_admin BOOLEAN;
  v_rows INTEGER;
  v_scenario_id UUID;
BEGIN
  IF p_updates IS NULL THEN
    RAISE EXCEPTION 'INVALID_UPDATES' USING ERRCODE = 'P0101';
  END IF;

  SELECT organization_id
  INTO v_reservation_org_id
  FROM reservations
  WHERE id = p_reservation_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'RESERVATION_NOT_FOUND' USING ERRCODE = 'P0100';
  END IF;

  v_caller_org_id := get_user_organization_id();
  v_is_admin := is_org_admin();

  IF NOT v_is_admin THEN
    IF v_caller_org_id IS NULL OR v_caller_org_id IS DISTINCT FROM v_reservation_org_id THEN
      RAISE EXCEPTION 'FORBIDDEN_ORG' USING ERRCODE = 'P0010';
    END IF;
  END IF;

  IF p_updates ? 'scenario_id' THEN
    IF (p_updates->'scenario_id') = 'null'::jsonb THEN
      v_scenario_id := NULL;
    ELSE
      v_scenario_id := NULLIF(p_updates->>'scenario_id', '')::uuid;
    END IF;
  END IF;

  UPDATE reservations
  SET
    store_id = CASE
      WHEN p_updates ? 'store_id' THEN NULLIF(p_updates->>'store_id', '')::uuid
      ELSE store_id
    END,
    display_customer_name = CASE
      WHEN p_updates ? 'display_customer_name' THEN NULLIF(p_updates->>'display_customer_name', '')
      ELSE display_customer_name
    END,
    status = CASE
      WHEN p_updates ? 'status' THEN NULLIF(p_updates->>'status', '')
      ELSE status
    END,
    payment_status = CASE
      WHEN p_updates ? 'payment_status' THEN NULLIF(p_updates->>'payment_status', '')
      ELSE payment_status
    END,
    gm_staff = CASE
      WHEN p_updates ? 'gm_staff' THEN NULLIF(p_updates->>'gm_staff', '')
      ELSE gm_staff
    END,
    assigned_staff = CASE
      WHEN p_updates ? 'assigned_staff' THEN (
        SELECT COALESCE(array_agg(v), ARRAY[]::text[])
        FROM jsonb_array_elements_text(p_updates->'assigned_staff') AS t(v)
      )
      ELSE assigned_staff
    END,
    participant_names = CASE
      WHEN p_updates ? 'participant_names' THEN (
        SELECT COALESCE(array_agg(v), ARRAY[]::text[])
        FROM jsonb_array_elements_text(p_updates->'participant_names') AS t(v)
      )
      ELSE participant_names
    END,
    scenario_id = CASE
      WHEN p_updates ? 'scenario_id' THEN v_scenario_id
      ELSE scenario_id
    END,
    updated_at = NOW()
  WHERE id = p_reservation_id;

  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RETURN v_rows = 1;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_update_reservation_fields(UUID, JSONB) TO authenticated;

-- 2) 予約料金をサーバー側で再計算（participant_count は既に更新済み前提）
CREATE OR REPLACE FUNCTION public.admin_recalculate_reservation_prices(
  p_reservation_id UUID,
  p_participant_names TEXT[] DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_reservation_org_id UUID;
  v_caller_org_id UUID;
  v_is_admin BOOLEAN;

  v_participant_count INTEGER;
  v_unit_price INTEGER;
  v_options_price INTEGER;
  v_discount_amount INTEGER;

  v_base_price INTEGER;
  v_total_price INTEGER;
  v_final_price INTEGER;
BEGIN
  -- ロックして値を取得
  SELECT organization_id,
         participant_count,
         unit_price,
         options_price,
         discount_amount,
         base_price
  INTO v_reservation_org_id,
       v_participant_count,
       v_unit_price,
       v_options_price,
       v_discount_amount,
       v_base_price
  FROM reservations
  WHERE id = p_reservation_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'RESERVATION_NOT_FOUND' USING ERRCODE = 'P0100';
  END IF;

  v_caller_org_id := get_user_organization_id();
  v_is_admin := is_org_admin();

  IF NOT v_is_admin THEN
    IF v_caller_org_id IS NULL OR v_caller_org_id IS DISTINCT FROM v_reservation_org_id THEN
      RAISE EXCEPTION 'FORBIDDEN_ORG' USING ERRCODE = 'P0010';
    END IF;
  END IF;

  -- unit_price が無い場合は base_price / participant_count から推定
  IF v_unit_price IS NULL THEN
    IF v_participant_count > 0 AND v_base_price IS NOT NULL THEN
      v_unit_price := CEIL(v_base_price::numeric / v_participant_count::numeric)::integer;
    ELSE
      v_unit_price := 0;
    END IF;
  END IF;

  v_options_price := COALESCE(v_options_price, 0);
  v_discount_amount := COALESCE(v_discount_amount, 0);

  v_base_price := v_unit_price * COALESCE(v_participant_count, 0);
  v_total_price := v_base_price + v_options_price;
  v_final_price := v_total_price - v_discount_amount;

  UPDATE reservations
  SET
    participant_names = COALESCE(p_participant_names, participant_names),
    unit_price = v_unit_price,
    base_price = v_base_price,
    total_price = v_total_price,
    final_price = v_final_price,
    updated_at = NOW()
  WHERE id = p_reservation_id;

  RETURN TRUE;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_recalculate_reservation_prices(UUID, TEXT[]) TO authenticated;

-- 3) reservations をIDで削除（admin/staff のみ）
CREATE OR REPLACE FUNCTION public.admin_delete_reservations_by_ids(
  p_reservation_ids UUID[]
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id UUID;
  v_caller_org_id UUID;
  v_is_admin BOOLEAN;
  v_distinct_orgs INTEGER;
  v_deleted INTEGER;
BEGIN
  IF p_reservation_ids IS NULL OR array_length(p_reservation_ids, 1) IS NULL THEN
    RETURN 0;
  END IF;

  SELECT COUNT(DISTINCT organization_id)
  INTO v_distinct_orgs
  FROM reservations
  WHERE id = ANY(p_reservation_ids);

  IF v_distinct_orgs IS NULL OR v_distinct_orgs = 0 THEN
    RETURN 0;
  END IF;

  IF v_distinct_orgs > 1 THEN
    RAISE EXCEPTION 'MULTI_ORG_NOT_ALLOWED' USING ERRCODE = 'P0102';
  END IF;

  SELECT organization_id
  INTO v_org_id
  FROM reservations
  WHERE id = ANY(p_reservation_ids)
  LIMIT 1;

  v_caller_org_id := get_user_organization_id();
  v_is_admin := is_org_admin();

  IF NOT v_is_admin THEN
    IF v_caller_org_id IS NULL OR v_caller_org_id IS DISTINCT FROM v_org_id THEN
      RAISE EXCEPTION 'FORBIDDEN_ORG' USING ERRCODE = 'P0010';
    END IF;
  END IF;

  DELETE FROM reservations
  WHERE id = ANY(p_reservation_ids)
    AND organization_id IS NOT DISTINCT FROM v_org_id;

  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_delete_reservations_by_ids(UUID[]) TO authenticated;

-- 4) schedule_event_id の配列で reservations を削除（admin/staff のみ）
CREATE OR REPLACE FUNCTION public.admin_delete_reservations_by_schedule_event_ids(
  p_schedule_event_ids UUID[]
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_event_org_id UUID;
  v_caller_org_id UUID;
  v_is_admin BOOLEAN;
  v_distinct_orgs INTEGER;
  v_deleted INTEGER;
BEGIN
  IF p_schedule_event_ids IS NULL OR array_length(p_schedule_event_ids, 1) IS NULL THEN
    RETURN 0;
  END IF;

  SELECT COUNT(DISTINCT organization_id)
  INTO v_distinct_orgs
  FROM schedule_events
  WHERE id = ANY(p_schedule_event_ids);

  IF v_distinct_orgs IS NULL OR v_distinct_orgs = 0 THEN
    RETURN 0;
  END IF;

  IF v_distinct_orgs > 1 THEN
    RAISE EXCEPTION 'MULTI_ORG_NOT_ALLOWED' USING ERRCODE = 'P0102';
  END IF;

  SELECT organization_id
  INTO v_event_org_id
  FROM schedule_events
  WHERE id = ANY(p_schedule_event_ids)
  LIMIT 1;

  v_caller_org_id := get_user_organization_id();
  v_is_admin := is_org_admin();

  IF NOT v_is_admin THEN
    IF v_caller_org_id IS NULL OR v_caller_org_id IS DISTINCT FROM v_event_org_id THEN
      RAISE EXCEPTION 'FORBIDDEN_ORG' USING ERRCODE = 'P0010';
    END IF;
  END IF;

  DELETE FROM reservations
  WHERE schedule_event_id = ANY(p_schedule_event_ids)
    AND organization_id IS NOT DISTINCT FROM v_event_org_id;

  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_delete_reservations_by_schedule_event_ids(UUID[]) TO authenticated;

-- 5) reservation_source で reservations を削除（admin/staff のみ）
CREATE OR REPLACE FUNCTION public.admin_delete_reservations_by_source(
  p_reservation_source TEXT
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_org_id UUID;
  v_is_admin BOOLEAN;
  v_deleted INTEGER;
BEGIN
  v_caller_org_id := get_user_organization_id();
  v_is_admin := is_org_admin();

  IF NOT v_is_admin AND v_caller_org_id IS NULL THEN
    RAISE EXCEPTION 'FORBIDDEN_ORG' USING ERRCODE = 'P0010';
  END IF;

  DELETE FROM reservations
  WHERE reservation_source = p_reservation_source
    AND (organization_id = v_caller_org_id OR v_is_admin);

  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_delete_reservations_by_source(TEXT) TO authenticated;

-- 6) scenario_id を参照している reservations の scenario_id を NULL にする（admin/staff のみ）
CREATE OR REPLACE FUNCTION public.admin_clear_reservations_scenario_id(
  p_scenario_id UUID
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_org_id UUID;
  v_is_admin BOOLEAN;
  v_updated INTEGER;
BEGIN
  v_caller_org_id := get_user_organization_id();
  v_is_admin := is_org_admin();

  IF NOT v_is_admin AND v_caller_org_id IS NULL THEN
    RAISE EXCEPTION 'FORBIDDEN_ORG' USING ERRCODE = 'P0010';
  END IF;

  UPDATE reservations
  SET scenario_id = NULL,
      updated_at = NOW()
  WHERE scenario_id = p_scenario_id
    AND (organization_id = v_caller_org_id OR v_is_admin);

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_clear_reservations_scenario_id(UUID) TO authenticated;

COMMIT;


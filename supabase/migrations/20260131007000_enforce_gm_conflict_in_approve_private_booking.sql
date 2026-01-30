-- =============================================================================
-- 20260131007000: approve_private_booking に「担当GMの既存予定」重複チェックを追加
-- =============================================================================
--
-- 背景:
-- - これまでの approve_private_booking は「同日・同店舗・時間帯の枠」しか見ておらず、
--   担当GMが同時間帯に別予定（別店舗/別イベント）を持っていても確定できてしまう。
-- - フロントの競合表示はUX目的に留まり、最終防衛はDBでfail-closedにする。
--
-- 方針:
-- - schedule_events.gms は現状「GM名(text)配列」として運用されているため、
--   staff.id ではなく staff.name（= v_gm_name）で重複を判定する。
-- - 重複があれば ERRCODE=P0025 で例外。
--
-- =============================================================================

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
    RAISE EXCEPTION 'GM_NOT_FOUND' USING ERRCODE = 'P0022';
  END IF;

  SELECT name INTO v_store_name
  FROM stores
  WHERE id = p_selected_store_id
    AND organization_id = v_org_id;

  IF v_store_name IS NULL THEN
    RAISE EXCEPTION 'STORE_NOT_FOUND' USING ERRCODE = 'P0023';
  END IF;

  -- -----------------------------------------------------------------------------
  -- 🚨 CRITICAL: 担当GMの既存予定重複チェック（別店舗/別イベントも含めてNG）
  -- -----------------------------------------------------------------------------
  PERFORM 1
  FROM schedule_events
  WHERE organization_id = v_org_id
    AND date = p_selected_date
    AND is_cancelled = false
    AND v_gm_name = ANY(gms)
    AND start_time < p_selected_end_time
    AND end_time > p_selected_start_time
  FOR UPDATE NOWAIT;

  IF FOUND THEN
    RAISE EXCEPTION 'GM_ALREADY_ASSIGNED' USING ERRCODE = 'P0025';
  END IF;

  -- -----------------------------------------------------------------------------
  -- 競合チェック（同日・同店舗・時間帯の重複を禁止）
  -- -----------------------------------------------------------------------------
  PERFORM 1
  FROM schedule_events
  WHERE organization_id = v_org_id
    AND date = p_selected_date
    AND store_id = p_selected_store_id
    AND is_cancelled = false
    AND start_time < p_selected_end_time
    AND end_time > p_selected_start_time
  FOR UPDATE NOWAIT;

  IF FOUND THEN
    RAISE EXCEPTION 'SLOT_ALREADY_OCCUPIED' USING ERRCODE = 'P0019';
  END IF;

  -- schedule_events を作成（貸切は非公開）
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
    is_reservation_enabled,
    status,
    category,
    organization_id,
    reservation_id,
    reservation_name,
    is_reservation_name_overwritten
  ) VALUES (
    p_selected_date,
    v_store_name,
    p_scenario_title,
    p_selected_start_time,
    p_selected_end_time,
    (p_selected_date + p_selected_start_time)::timestamptz,
    (p_selected_date + p_selected_end_time)::timestamptz,
    p_selected_store_id,
    ARRAY[v_gm_name],
    false,
    'confirmed',
    'private',
    v_org_id,
    p_reservation_id,
    p_customer_name,
    false
  )
  RETURNING id INTO v_schedule_event_id;

  -- 予約を更新（必ず成功させる / 0件なら例外）
  UPDATE reservations
  SET
    status = 'confirmed',
    gm_staff = p_selected_gm_id,
    store_id = p_selected_store_id,
    schedule_event_id = v_schedule_event_id,
    candidate_datetimes = COALESCE(p_candidate_datetimes, candidate_datetimes),
    updated_at = NOW()
  WHERE id = p_reservation_id;

  GET DIAGNOSTICS v_updated_count = ROW_COUNT;
  IF v_updated_count <> 1 THEN
    RAISE EXCEPTION 'RESERVATION_UPDATE_FAILED' USING ERRCODE = 'P0024';
  END IF;

  RETURN v_schedule_event_id;
END;
$$;

GRANT EXECUTE ON FUNCTION approve_private_booking TO authenticated;

COMMENT ON FUNCTION approve_private_booking IS
'貸切予約承認をアトミックに実行。店舗枠の重複に加えて、担当GMの既存予定（schedule_events.gms）との時間重複も禁止（P0025）。';


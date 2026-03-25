-- =============================================================================
-- 20260323100000: reservations に confirmed_by カラムを追加
-- =============================================================================
--
-- 目的:
-- - 貸切予約の承認者を記録する
-- - 顧客側で「誰が承認したか」を表示できるようにする
--
-- =============================================================================

-- confirmed_by カラムを追加
ALTER TABLE public.reservations
ADD COLUMN IF NOT EXISTS confirmed_by UUID REFERENCES public.staff(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.reservations.confirmed_by IS '予約を承認したスタッフのID';

-- インデックスを追加
CREATE INDEX IF NOT EXISTS idx_reservations_confirmed_by ON public.reservations(confirmed_by);

-- approve_private_booking RPCを更新して承認者を記録する
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
  v_caller_staff_id UUID;
  v_schedule_event_id UUID;
  v_existing_event_id UUID;
  v_gm_name TEXT;
  v_store_name TEXT;
  v_updated_count INTEGER;
  v_private_group_id UUID;
BEGIN
  -- 予約をロックして取得（confirmedも許可）
  SELECT *
  INTO v_reservation
  FROM reservations
  WHERE id = p_reservation_id
    AND status IN ('pending', 'gm_confirmed', 'confirmed')
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'RESERVATION_NOT_FOUND_OR_ALREADY_CONFIRMED' USING ERRCODE = 'P0018';
  END IF;

  v_org_id := v_reservation.organization_id;
  v_private_group_id := v_reservation.private_group_id;
  v_existing_event_id := v_reservation.schedule_event_id;

  -- 権限（スタッフ/管理者のみ）
  v_caller_org_id := get_user_organization_id();
  IF NOT (is_org_admin() OR (v_caller_org_id IS NOT NULL AND v_caller_org_id = v_org_id)) THEN
    RAISE EXCEPTION 'UNAUTHORIZED' USING ERRCODE = 'P0010';
  END IF;

  -- 承認者のstaff_idを取得
  SELECT id INTO v_caller_staff_id
  FROM staff
  WHERE user_id = auth.uid()
    AND organization_id = v_org_id;

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
  -- 再承認の場合: 既存のschedule_eventをキャンセル
  -- -----------------------------------------------------------------------------
  IF v_existing_event_id IS NOT NULL THEN
    UPDATE schedule_events
    SET is_cancelled = true,
        updated_at = NOW()
    WHERE id = v_existing_event_id;
  END IF;

  -- -----------------------------------------------------------------------------
  -- 🚨 CRITICAL: 担当GMの既存予定重複チェック（自分のイベントは除外）
  -- -----------------------------------------------------------------------------
  PERFORM 1
  FROM schedule_events
  WHERE organization_id = v_org_id
    AND date = p_selected_date
    AND is_cancelled = false
    AND v_gm_name = ANY(gms)
    AND start_time < p_selected_end_time
    AND end_time > p_selected_start_time
    AND id != COALESCE(v_existing_event_id, '00000000-0000-0000-0000-000000000000'::uuid)
  FOR UPDATE NOWAIT;

  IF FOUND THEN
    RAISE EXCEPTION 'GM_ALREADY_ASSIGNED' USING ERRCODE = 'P0025';
  END IF;

  -- -----------------------------------------------------------------------------
  -- 競合チェック（同日・同店舗・時間帯の重複を禁止、自分のイベントは除外）
  -- -----------------------------------------------------------------------------
  PERFORM 1
  FROM schedule_events
  WHERE organization_id = v_org_id
    AND date = p_selected_date
    AND store_id = p_selected_store_id
    AND is_cancelled = false
    AND start_time < p_selected_end_time
    AND end_time > p_selected_start_time
    AND id != COALESCE(v_existing_event_id, '00000000-0000-0000-0000-000000000000'::uuid)
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

  -- 予約を更新（confirmed_by を追加）
  UPDATE reservations
  SET
    status = 'confirmed',
    gm_staff = p_selected_gm_id,
    store_id = p_selected_store_id,
    schedule_event_id = v_schedule_event_id,
    candidate_datetimes = COALESCE(p_candidate_datetimes, candidate_datetimes),
    requested_datetime = (p_selected_date || ' ' || p_selected_start_time)::TIMESTAMP WITH TIME ZONE,
    duration = EXTRACT(EPOCH FROM (p_selected_end_time - p_selected_start_time)) / 60,
    confirmed_by = COALESCE(v_caller_staff_id, confirmed_by),
    updated_at = NOW()
  WHERE id = p_reservation_id;

  GET DIAGNOSTICS v_updated_count = ROW_COUNT;
  IF v_updated_count <> 1 THEN
    RAISE EXCEPTION 'RESERVATION_UPDATE_FAILED' USING ERRCODE = 'P0024';
  END IF;

  -- 紐付いたグループがある場合、ステータスを confirmed に更新
  IF v_private_group_id IS NOT NULL THEN
    UPDATE private_groups
    SET status = 'confirmed'
    WHERE id = v_private_group_id;
  END IF;

  RETURN v_schedule_event_id;
END;
$$;

GRANT EXECUTE ON FUNCTION approve_private_booking(UUID, DATE, TIME, TIME, UUID, UUID, JSONB, TEXT, TEXT) TO authenticated;

COMMENT ON FUNCTION approve_private_booking(UUID, DATE, TIME, TIME, UUID, UUID, JSONB, TEXT, TEXT) IS
'貸切予約承認をアトミックに実行。店舗枠の重複に加えて、担当GMの既存予定との時間重複も禁止。紐付いたprivate_groupsのステータスも自動更新。承認者のスタッフIDをconfirmed_byに記録。';

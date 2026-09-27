-- QW-20260917-001: 予約の実顧客で本人を照合。互換引数p_customer_idを認可に使わない。
-- 引数・既存業務動作・ACL/RLSは変更しない。
CREATE OR REPLACE FUNCTION public.cancel_reservation_and_group_with_lock(p_reservation_id uuid, p_customer_id uuid, p_cancellation_reason text DEFAULT NULL::text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
 SET row_security TO 'off'
AS $function$
DECLARE
  v_reservation RECORD;
  v_event_id UUID;
  v_caller_org_id UUID;
  v_actual_participants INTEGER;
  v_group RECORD;
  v_event_is_cancelled BOOLEAN;
  v_event_exists BOOLEAN := FALSE;
BEGIN
  -- 予約をロック（cancel_reservation_with_lock と同じ認可チェック）
  SELECT id, schedule_event_id, status, customer_id, organization_id, private_group_id
  INTO v_reservation
  FROM public.reservations
  WHERE id = p_reservation_id
    AND status != 'cancelled'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'RESERVATION_NOT_FOUND' USING ERRCODE = 'P0005';
  END IF;

  v_event_id := v_reservation.schedule_event_id;

  -- 組織境界チェック
  v_caller_org_id := get_user_organization_id();

  IF NOT (
    -- 自分の予約（顧客として — customer_id で照合）
    EXISTS (
      SELECT 1 FROM public.customers c
      WHERE c.id = v_reservation.customer_id
        AND c.user_id = auth.uid()
    )
    OR (
      -- 同組織の admin
      is_org_admin()
      AND (v_caller_org_id IS NOT DISTINCT FROM v_reservation.organization_id)
    )
    OR (
      -- スタッフ権限
      EXISTS (
        SELECT 1 FROM staff
        WHERE user_id = auth.uid()
          AND organization_id = v_reservation.organization_id
          AND status = 'active'
      )
    )
  ) THEN
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE = 'P0009';
  END IF;

  -- 逆順でグループをロックする申込処理と競合した場合は待たずに再試行する。
  IF v_reservation.private_group_id IS NOT NULL THEN
    SELECT * INTO v_group FROM public.private_groups
    WHERE id = v_reservation.private_group_id
      AND organization_id = v_reservation.organization_id
    FOR UPDATE NOWAIT;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'PRIVATE_GROUP_ORGANIZATION_MISMATCH' USING ERRCODE='P0050';
    END IF;
    IF v_group.reservation_id IS DISTINCT FROM v_reservation.id THEN
      RAISE EXCEPTION 'PRIVATE_GROUP_RESERVATION_MISMATCH' USING ERRCODE='P0051';
    END IF;
  END IF;

  IF v_event_id IS NOT NULL THEN
    SELECT is_cancelled INTO v_event_is_cancelled FROM public.schedule_events
    WHERE id=v_event_id FOR UPDATE NOWAIT;
    v_event_exists := FOUND;
  END IF;

  -- 予約ステータスを更新
  UPDATE public.reservations
  SET status = 'cancelled',
      cancelled_at = NOW(),
      cancellation_reason = p_cancellation_reason,
      updated_at = NOW()
  WHERE id = p_reservation_id;

  -- 中止公演の人数は保持し、来場済みも有効人数として数える。
  IF v_event_exists AND v_event_is_cancelled IS NOT TRUE THEN
    SELECT COALESCE(SUM(participant_count), 0) INTO v_actual_participants
    FROM public.reservations WHERE schedule_event_id=v_event_id
      AND status IN ('pending','confirmed','gm_confirmed','checked_in');
    UPDATE public.schedule_events
    SET current_participants=v_actual_participants,updated_at=NOW()
    WHERE id=v_event_id;
  END IF;

  -- 貸切グループが紐づいている場合、同一トランザクションでキャンセル
  IF v_reservation.private_group_id IS NOT NULL THEN
    UPDATE public.private_groups
    SET status = 'cancelled',
        updated_at = NOW()
    WHERE id = v_reservation.private_group_id
      AND organization_id = v_reservation.organization_id
      AND reservation_id = v_reservation.id
      AND status != 'cancelled';
  END IF;

  RETURN TRUE;
END;
$function$;

CREATE OR REPLACE FUNCTION public.cancel_reservation_with_lock(p_reservation_id uuid, p_customer_id uuid, p_cancellation_reason text DEFAULT NULL::text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
 SET row_security TO 'off'
AS $function$
DECLARE
  v_reservation RECORD;
  v_event_id UUID;
  v_caller_org_id UUID;
  v_actual_participants INTEGER;
  v_event_is_cancelled BOOLEAN;
BEGIN
  -- 予約をロック
  SELECT id, schedule_event_id, status, customer_id, organization_id
  INTO v_reservation
  FROM public.reservations
  WHERE id = p_reservation_id
    AND status != 'cancelled'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'RESERVATION_NOT_FOUND' USING ERRCODE = 'P0005';
  END IF;

  v_event_id := v_reservation.schedule_event_id;

  -- 組織境界チェック
  v_caller_org_id := get_user_organization_id();

  IF NOT (
    -- 自分の予約（顧客として — customer_id で照合）
    EXISTS (
      SELECT 1 FROM public.customers c
      WHERE c.id = v_reservation.customer_id
        AND c.user_id = auth.uid()
    )
    OR (
      -- 同組織の admin
      is_org_admin()
      AND (v_caller_org_id IS NOT DISTINCT FROM v_reservation.organization_id)
    )
    OR (
      -- スタッフ権限
      EXISTS (
        SELECT 1 FROM staff
        WHERE user_id = auth.uid()
          AND organization_id = v_reservation.organization_id
          AND status = 'active'
      )
    )
  ) THEN
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE = 'P0009';
  END IF;

  -- ステータスを更新
  UPDATE public.reservations
  SET status = 'cancelled',
      cancelled_at = NOW(),
      cancellation_reason = p_cancellation_reason,
      updated_at = NOW()
  WHERE id = p_reservation_id;

  -- 公演の中止状態を確認
  SELECT is_cancelled INTO v_event_is_cancelled
  FROM schedule_events
  WHERE id = v_event_id;

  -- 在庫を再計算（公演が中止済みの場合はスキップ：中止前の人数を保持）
  IF NOT v_event_is_cancelled THEN
    SELECT COALESCE(SUM(participant_count), 0)
    INTO v_actual_participants
    FROM reservations
    WHERE schedule_event_id = v_event_id
      AND status IN ('pending', 'confirmed', 'gm_confirmed', 'checked_in');

    UPDATE schedule_events
    SET current_participants = v_actual_participants,
        updated_at = NOW()
    WHERE id = v_event_id;
  END IF;

  RETURN TRUE;
END;
$function$;

-- 通知付き入口へ移行済み。直接呼び出して通知を省略できないようにする。
REVOKE EXECUTE ON FUNCTION public.cancel_reservation_and_group_with_lock(uuid,uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_reservation_and_group_with_lock(uuid,uuid,text) TO service_role;

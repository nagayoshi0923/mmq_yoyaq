-- QW-20260917-001: 予約のみの取消は同組織の管理者・有効スタッフに限定。
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
  v_event_exists BOOLEAN := FALSE;
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

  IF auth.uid() IS NULL OR NOT COALESCE((
    (
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
  ), false) THEN
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE = 'P0009';
  END IF;

  IF v_event_id IS NOT NULL THEN
    SELECT is_cancelled INTO v_event_is_cancelled FROM public.schedule_events
    WHERE id = v_event_id FOR UPDATE NOWAIT;
    v_event_exists := FOUND;
  END IF;

  -- ステータスを更新
  UPDATE public.reservations
  SET status = 'cancelled',
      cancelled_at = NOW(),
      cancellation_reason = p_cancellation_reason,
      updated_at = NOW()
  WHERE id = p_reservation_id;

  -- NULLの旧公演も通常集計し、中止公演の人数は保持する。
  IF v_event_exists AND v_event_is_cancelled IS NOT TRUE THEN
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

CREATE OR REPLACE FUNCTION public.cancel_reservation_with_lock(p_reservation_id uuid, p_cancellation_reason text DEFAULT NULL::text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public SET row_security=off AS $$
BEGIN
  RETURN public.cancel_reservation_with_lock(p_reservation_id, NULL::uuid, p_cancellation_reason);
END;
$$;

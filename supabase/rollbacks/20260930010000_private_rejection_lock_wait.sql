-- 20260930010000 を戻す: NOWAIT 定義（2026-09-27 版）へ戻す。権限は CREATE OR REPLACE で保持される。
CREATE OR REPLACE FUNCTION public.mark_private_group_rejected_after_booking_rejection(p_reservation_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
DECLARE
  v_reservation record;
  v_group record;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'UNAUTHORIZED' USING ERRCODE='42501';
  END IF;

  SELECT id,organization_id,private_group_id,status INTO v_reservation
  FROM public.reservations WHERE id=p_reservation_id FOR UPDATE NOWAIT;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'RESERVATION_NOT_FOUND' USING ERRCODE='P0005';
  END IF;
  IF NOT COALESCE(
    (public.is_org_admin() AND public.get_user_organization_id()=v_reservation.organization_id)
    OR EXISTS(SELECT 1 FROM public.staff WHERE user_id=auth.uid()
      AND organization_id=v_reservation.organization_id AND status='active'),false
  ) THEN
    RAISE EXCEPTION 'UNAUTHORIZED' USING ERRCODE='42501';
  END IF;
  IF v_reservation.status IS DISTINCT FROM 'cancelled' THEN
    RAISE EXCEPTION 'RESERVATION_NOT_CANCELLED' USING ERRCODE='22023';
  END IF;
  IF v_reservation.private_group_id IS NULL THEN RETURN; END IF;

  SELECT id,organization_id,reservation_id,status INTO v_group
  FROM public.private_groups WHERE id=v_reservation.private_group_id FOR UPDATE NOWAIT;
  IF NOT FOUND OR v_group.organization_id IS DISTINCT FROM v_reservation.organization_id THEN
    RAISE EXCEPTION 'PRIVATE_GROUP_ORGANIZATION_MISMATCH' USING ERRCODE='P0050';
  END IF;
  IF v_group.reservation_id IS DISTINCT FROM v_reservation.id THEN
    RAISE EXCEPTION 'PRIVATE_GROUP_RESERVATION_MISMATCH' USING ERRCODE='P0051';
  END IF;
  -- 同じ却下の再試行で、その後に追加された候補を再び却下しない。
  IF v_group.status='date_adjusting' THEN RETURN; END IF;
  IF v_group.status IS NULL OR v_group.status NOT IN ('booking_requested','confirmed') THEN
    RAISE EXCEPTION 'PRIVATE_GROUP_NOT_AWAITING_REJECTION' USING ERRCODE='22023';
  END IF;

  PERFORM 1 FROM public.private_group_candidate_dates
  WHERE group_id=v_group.id FOR UPDATE NOWAIT;
  UPDATE public.private_groups SET status='date_adjusting' WHERE id=v_group.id;
  UPDATE public.private_group_candidate_dates SET status='rejected' WHERE group_id=v_group.id;
END;
$$;
COMMENT ON FUNCTION public.mark_private_group_rejected_after_booking_rejection(uuid) IS
  '同組織の管理者・有効スタッフのみ。取消済みの最新予約とグループを検証して却下後の状態・候補日を一括同期。';

-- 貸切リクエスト却下時: private_groups / private_group_candidate_dates は RLS で主催者のみ UPDATE 可能なため、
-- 店舗スタッフのクライアントからの直接 UPDATE は 0 件になり、候補が却下表示にならない問題があった。
-- 組織スタッフ（または主催者）のみ呼べる SECURITY DEFINER RPC でまとめて更新する。

CREATE OR REPLACE FUNCTION public.mark_private_group_rejected_after_booking_rejection(p_reservation_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
DECLARE
  v_org_id uuid;
  v_group_id uuid;
  v_caller_org_id uuid;
BEGIN
  SELECT organization_id, private_group_id
  INTO v_org_id, v_group_id
  FROM public.reservations
  WHERE id = p_reservation_id;

  IF v_group_id IS NULL THEN
    RETURN;
  END IF;

  v_caller_org_id := public.get_user_organization_id();
  IF NOT (
    public.is_org_admin()
    OR (v_caller_org_id IS NOT NULL AND v_caller_org_id = v_org_id)
    OR EXISTS (
      SELECT 1 FROM public.private_groups pg
      WHERE pg.id = v_group_id AND pg.organizer_id = auth.uid()
    )
  ) THEN
    RAISE EXCEPTION 'UNAUTHORIZED' USING ERRCODE = 'P0010';
  END IF;

  UPDATE public.private_groups
  SET status = 'date_adjusting'
  WHERE id = v_group_id;

  UPDATE public.private_group_candidate_dates
  SET status = 'rejected'
  WHERE group_id = v_group_id;
END;
$$;

COMMENT ON FUNCTION public.mark_private_group_rejected_after_booking_rejection(uuid) IS
  '貸切予約却下後に private_groups を date_adjusting に、同一グループの候補日を rejected に更新（RLS をバイパス、スタッフ権限チェックあり）';

REVOKE ALL ON FUNCTION public.mark_private_group_rejected_after_booking_rejection(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mark_private_group_rejected_after_booking_rejection(uuid) TO authenticated;

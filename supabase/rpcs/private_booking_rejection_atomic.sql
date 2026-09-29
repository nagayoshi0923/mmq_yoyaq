-- QW-20260917-001: 貸切却下の予約・公演・候補・通知を同一トランザクションへ集約。
CREATE OR REPLACE FUNCTION public.reject_private_booking_with_notice(
  p_reservation_id uuid, p_message_body text
) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public SET row_security = off
AS $$
DECLARE
  v_reservation public.reservations%ROWTYPE;
  v_event public.schedule_events%ROWTYPE;
  v_group public.private_groups%ROWTYPE;
  v_message text;
  v_notice_id uuid;
  v_cancelled_at timestamptz;
  v_existing public.private_group_messages%ROWTYPE;
  v_reason constant text := '貸切リクエストを却下しました';
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'UNAUTHORIZED' USING ERRCODE='42501'; END IF;
  IF p_message_body IS NULL OR length(btrim(p_message_body))=0 OR length(p_message_body)>20000 THEN
    RAISE EXCEPTION 'INVALID_REJECTION_MESSAGE' USING ERRCODE='22023';
  END IF;
  SELECT * INTO v_reservation FROM public.reservations
  WHERE id=p_reservation_id FOR UPDATE NOWAIT;
  IF NOT FOUND THEN RAISE EXCEPTION 'RESERVATION_NOT_FOUND' USING ERRCODE='P0005'; END IF;
  IF NOT COALESCE((public.is_org_admin() AND public.get_user_organization_id()=v_reservation.organization_id)
    OR EXISTS(SELECT 1 FROM public.staff WHERE user_id=auth.uid()
      AND organization_id=v_reservation.organization_id AND status='active'),false) THEN
    RAISE EXCEPTION 'UNAUTHORIZED' USING ERRCODE='42501';
  END IF;
  IF v_reservation.status='cancelled' AND v_reservation.cancellation_reason IS DISTINCT FROM v_reason THEN
    RAISE EXCEPTION 'RESERVATION_ALREADY_CANCELLED' USING ERRCODE='22023';
  END IF;
  -- 取消日時が同じなら再試行。再承認後の却下は新しい取消日時で別通知にする。
  v_cancelled_at := CASE WHEN v_reservation.status='cancelled' THEN v_reservation.cancelled_at ELSE now() END;
  IF v_cancelled_at IS NULL THEN
    RAISE EXCEPTION 'REJECTION_TIMESTAMP_MISSING' USING ERRCODE='22023';
  END IF;
  v_notice_id := md5(v_reservation.id::text || ':' || extract(epoch FROM v_cancelled_at)::text)::uuid;
  IF v_reservation.schedule_event_id IS NOT NULL THEN
    SELECT * INTO v_event FROM public.schedule_events WHERE id=v_reservation.schedule_event_id FOR UPDATE NOWAIT;
    IF NOT FOUND OR v_event.organization_id IS DISTINCT FROM v_reservation.organization_id THEN
      RAISE EXCEPTION 'EVENT_ORGANIZATION_MISMATCH' USING ERRCODE='P0050';
    END IF;
    IF v_event.category IS DISTINCT FROM 'private' AND v_event.is_private_booking IS NOT TRUE THEN
      RAISE EXCEPTION 'EVENT_NOT_PRIVATE' USING ERRCODE='22023';
    END IF;
    -- 他の予約が残る公演を、この申込の却下だけで中止にしない。
    PERFORM 1 FROM public.reservations WHERE schedule_event_id=v_event.id AND id<>v_reservation.id
      AND status IN ('pending','confirmed','gm_confirmed','checked_in') FOR UPDATE NOWAIT;
    IF FOUND THEN RAISE EXCEPTION 'PRIVATE_EVENT_HAS_OTHER_RESERVATIONS' USING ERRCODE='22023'; END IF;
  END IF;
  IF v_reservation.private_group_id IS NULL AND v_reservation.reservation_source IS DISTINCT FROM 'web_private'
    AND v_reservation.schedule_event_id IS NULL THEN
    RAISE EXCEPTION 'RESERVATION_NOT_PRIVATE' USING ERRCODE='22023';
  END IF;
  IF v_reservation.private_group_id IS NOT NULL THEN
    SELECT * INTO v_group FROM public.private_groups WHERE id=v_reservation.private_group_id FOR UPDATE NOWAIT;
    IF NOT FOUND OR v_group.organization_id IS DISTINCT FROM v_reservation.organization_id THEN
      RAISE EXCEPTION 'PRIVATE_GROUP_ORGANIZATION_MISMATCH' USING ERRCODE='P0050';
    END IF;
    IF v_group.reservation_id IS DISTINCT FROM v_reservation.id THEN
      RAISE EXCEPTION 'PRIVATE_GROUP_RESERVATION_MISMATCH' USING ERRCODE='P0051';
    END IF;
    IF v_group.status IS NULL OR v_group.status NOT IN ('booking_requested','confirmed','date_adjusting')
      OR (v_group.status='date_adjusting' AND v_reservation.status IS DISTINCT FROM 'cancelled') THEN
      RAISE EXCEPTION 'PRIVATE_GROUP_NOT_AWAITING_REJECTION' USING ERRCODE='22023';
    END IF;
    v_message := jsonb_build_object('type','system','action','booking_rejected',
      'title','貸切リクエストが却下されました','body',p_message_body,'reservation_id',v_reservation.id,'cancelled_at_epoch',extract(epoch FROM v_cancelled_at))::text;
    -- 予約と取消日時から通知IDを固定し、同じ却下の再実行で通知を増やさない。
    -- 万一既存IDと衝突した場合は別通知を上書きせず、処理全体を拒否する。
    SELECT * INTO v_existing FROM public.private_group_messages WHERE id=v_notice_id FOR UPDATE NOWAIT;
    IF FOUND AND (v_existing.group_id IS DISTINCT FROM v_group.id
      OR v_existing.member_id IS NOT NULL OR v_existing.message IS DISTINCT FROM v_message) THEN
      RAISE EXCEPTION 'REJECTION_NOTICE_CONFLICT' USING ERRCODE='22023';
    END IF;
  END IF;
  IF v_reservation.status IS DISTINCT FROM 'cancelled' THEN
    IF public.cancel_reservation_with_lock(v_reservation.id,v_reservation.customer_id,v_reason) IS DISTINCT FROM true THEN
      RAISE EXCEPTION 'RESERVATION_CANCEL_FAILED';
    END IF;
  END IF;
  IF v_reservation.schedule_event_id IS NOT NULL AND v_event.is_cancelled IS NOT TRUE THEN
    UPDATE public.schedule_events SET is_cancelled=true,cancelled_at=now(),
      cancellation_reason=v_reason,updated_at=now() WHERE id=v_event.id;
  END IF;
  IF v_reservation.private_group_id IS NOT NULL THEN
    PERFORM public.mark_private_group_rejected_after_booking_rejection(v_reservation.id);
    INSERT INTO public.private_group_messages(id,group_id,member_id,message)
    VALUES(v_notice_id,v_group.id,NULL,v_message) ON CONFLICT(id) DO NOTHING;
    -- 事前確認後に同じIDが挿入された場合も、別内容を成功扱いにしない。
    SELECT * INTO v_existing FROM public.private_group_messages WHERE id=v_notice_id FOR UPDATE NOWAIT;
    IF NOT FOUND OR v_existing.group_id IS DISTINCT FROM v_group.id
      OR v_existing.member_id IS NOT NULL OR v_existing.message IS DISTINCT FROM v_message THEN
      RAISE EXCEPTION 'REJECTION_NOTICE_CONFLICT' USING ERRCODE='22023';
    END IF;
  END IF;
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.reject_private_booking_with_notice(uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.reject_private_booking_with_notice(uuid,text) TO service_role;
COMMENT ON FUNCTION public.reject_private_booking_with_notice(uuid,text) IS
  '同組織管理者・有効スタッフ専用。貸切予約却下、公演中止、グループ差戻し、候補却下、チャット通知を一括保存。通知IDは予約IDと取消日時で固定。';

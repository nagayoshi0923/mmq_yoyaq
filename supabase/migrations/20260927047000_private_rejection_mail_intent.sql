BEGIN;
-- 却下保存と同じトランザクションで作る送信予定。クライアントから直接アクセスさせない。
CREATE TABLE IF NOT EXISTS public.private_booking_rejection_deliveries (
  id uuid PRIMARY KEY,
  reservation_id uuid NOT NULL,
  organization_id uuid NOT NULL,
  cancelled_at timestamptz NOT NULL,
  customer_email text,
  customer_name text NOT NULL,
  scenario_title text NOT NULL,
  message_body text NOT NULL CHECK (length(btrim(message_body)) > 0 AND length(message_body) <= 20000),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','sending','sent','failed','uncertain','superseded')),
  attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  first_attempt_at timestamptz,
  lease_until timestamptz,
  lease_token uuid,
  provider_payload jsonb CHECK (provider_payload IS NULL OR jsonb_typeof(provider_payload)='object'),
  provider_account_hash text,
  provider_message_id text,
  email_log_id uuid,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(reservation_id,cancelled_at)
);
CREATE INDEX IF NOT EXISTS private_rejection_delivery_pending_idx
  ON public.private_booking_rejection_deliveries(next_attempt_at) WHERE status IN ('pending','sending');
-- 新規テーブルだけRLSを有効化。クライアント向けポリシーは作らず、既存テーブルのポリシーは変更しない。
ALTER TABLE public.private_booking_rejection_deliveries ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.private_booking_rejection_deliveries FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT,UPDATE ON public.private_booking_rejection_deliveries TO service_role;
COMMENT ON TABLE public.private_booking_rejection_deliveries IS
  '貸切却下の送信予定と結果。予約取消世代ごとに一意。本人・スタッフも専用RPC経由のみ。履歴保全のため予約削除と連動削除しない。';

-- QW-20260917-001: 貸切却下の予約・公演・候補・通知を同一トランザクションへ集約。
CREATE OR REPLACE FUNCTION public.reject_private_booking_with_delivery(
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
  v_delivery public.private_booking_rejection_deliveries%ROWTYPE;
  v_customer_email text;
  v_customer_name text;
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
  -- 再試行時は元の送信スナップショットを保持し、アドレス変更で別送信を作らない。
  SELECT * INTO v_delivery FROM public.private_booking_rejection_deliveries
    WHERE id=v_notice_id FOR UPDATE NOWAIT;
  IF FOUND THEN
    IF v_delivery.reservation_id IS DISTINCT FROM v_reservation.id
      OR v_delivery.organization_id IS DISTINCT FROM v_reservation.organization_id
      OR v_delivery.cancelled_at IS DISTINCT FROM v_cancelled_at
      OR v_delivery.message_body IS DISTINCT FROM p_message_body THEN
      RAISE EXCEPTION 'REJECTION_DELIVERY_CONFLICT' USING ERRCODE='22023';
    END IF;
  ELSE
    SELECT email,name INTO v_customer_email,v_customer_name FROM public.customers
      WHERE id=v_reservation.customer_id
        AND (organization_id=v_reservation.organization_id OR organization_id IS NULL);
    INSERT INTO public.private_booking_rejection_deliveries(
      id,reservation_id,organization_id,cancelled_at,customer_email,customer_name,scenario_title,message_body,status,last_error
    ) VALUES (
      v_notice_id,v_reservation.id,v_reservation.organization_id,v_cancelled_at,
      nullif(btrim(coalesce(nullif(v_reservation.customer_email,''),v_customer_email)),''),
      coalesce(nullif(v_reservation.customer_name,''),nullif(v_customer_name,''),'お客様'),
      coalesce(v_reservation.title,''),p_message_body,
      CASE WHEN v_reservation.status='cancelled' THEN 'uncertain' ELSE 'pending' END,
      CASE WHEN v_reservation.status='cancelled' THEN 'legacy_delivery_unconfirmed' ELSE NULL END
    );
  END IF;
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.reject_private_booking_with_delivery(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.reject_private_booking_with_delivery(uuid,text) TO authenticated,service_role;
COMMENT ON FUNCTION public.reject_private_booking_with_delivery(uuid,text) IS
  '同組織管理者・有効スタッフ専用。貸切予約却下、公演中止、グループ差戻し、候補却下、チャット通知とメール送信予定を一括保存。通知IDは予約IDと取消日時で固定。';

CREATE OR REPLACE FUNCTION public.get_private_rejection_delivery_status(p_reservation_ids uuid[])
RETURNS TABLE(reservation_id uuid,status text,attempt_count integer,last_error text,updated_at timestamptz,can_retry boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public SET row_security=off AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'UNAUTHORIZED' USING ERRCODE='42501'; END IF;
  IF coalesce(cardinality(p_reservation_ids),0)>100 THEN RAISE EXCEPTION 'TOO_MANY_RESERVATIONS' USING ERRCODE='22023'; END IF;
  RETURN QUERY SELECT d.reservation_id,d.status,d.attempt_count,d.last_error,d.updated_at,(d.status='failed' AND d.first_attempt_at IS NULL)
  FROM public.private_booking_rejection_deliveries d
  JOIN public.reservations r ON r.id=d.reservation_id AND r.organization_id=d.organization_id AND r.cancelled_at=d.cancelled_at
  WHERE d.reservation_id=ANY(p_reservation_ids) AND r.status='cancelled'
    AND COALESCE((public.is_org_admin() AND public.get_user_organization_id()=d.organization_id)
      OR EXISTS(SELECT 1 FROM public.staff s WHERE s.user_id=auth.uid() AND s.organization_id=d.organization_id AND s.status='active'),false);
END; $$;
REVOKE ALL ON FUNCTION public.get_private_rejection_delivery_status(uuid[]) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_private_rejection_delivery_status(uuid[]) TO authenticated,service_role;

CREATE OR REPLACE FUNCTION public.retry_private_rejection_delivery(p_reservation_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public SET row_security=off AS $$
DECLARE v_res public.reservations%ROWTYPE;v_delivery public.private_booking_rejection_deliveries%ROWTYPE;v_email text;v_name text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'UNAUTHORIZED' USING ERRCODE='42501'; END IF;
  SELECT * INTO v_res FROM public.reservations WHERE id=p_reservation_id FOR UPDATE NOWAIT;
  IF NOT FOUND THEN RAISE EXCEPTION 'RESERVATION_NOT_FOUND' USING ERRCODE='P0005'; END IF;
  IF NOT COALESCE((public.is_org_admin() AND public.get_user_organization_id()=v_res.organization_id)
    OR EXISTS(SELECT 1 FROM public.staff WHERE user_id=auth.uid() AND organization_id=v_res.organization_id AND status='active'),false)
    THEN RAISE EXCEPTION 'UNAUTHORIZED' USING ERRCODE='42501'; END IF;
  SELECT * INTO v_delivery FROM public.private_booking_rejection_deliveries
    WHERE reservation_id=v_res.id AND organization_id=v_res.organization_id AND cancelled_at=v_res.cancelled_at FOR UPDATE NOWAIT;
  IF NOT FOUND OR v_res.status IS DISTINCT FROM 'cancelled' OR v_delivery.status IS DISTINCT FROM 'failed' OR v_delivery.first_attempt_at IS NOT NULL
    THEN RAISE EXCEPTION 'DELIVERY_NOT_SAFE_TO_RETRY' USING ERRCODE='22023'; END IF;
  SELECT email,name INTO v_email,v_name FROM public.customers WHERE id=v_res.customer_id
    AND (organization_id=v_res.organization_id OR organization_id IS NULL);
  -- 送信要求を一度も出していない記録だけ、明示操作で現在の連絡先を再取得する。
  UPDATE public.email_logs SET status='failed',error_message='superseded_before_send'
    WHERE id=coalesce(v_delivery.email_log_id,v_delivery.id) AND organization_id=v_delivery.organization_id
      AND reservation_id=v_delivery.reservation_id AND status='queued'
      AND email_type='reservation_cancelled' AND body_text=v_delivery.message_body
      AND to_email IS NOT DISTINCT FROM v_delivery.customer_email;
  UPDATE public.private_booking_rejection_deliveries SET status='pending',attempt_count=0,next_attempt_at=now(),
    email_log_id=gen_random_uuid(),provider_payload=NULL,provider_account_hash=NULL,lease_token=NULL,lease_until=NULL,last_error=NULL,
    customer_email=nullif(btrim(coalesce(nullif(v_res.customer_email,''),v_email)),''),
    customer_name=coalesce(nullif(v_res.customer_name,''),nullif(v_name,''),'お客様'),updated_at=now()
    WHERE id=v_delivery.id;
  RETURN true;
END; $$;
REVOKE ALL ON FUNCTION public.retry_private_rejection_delivery(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.retry_private_rejection_delivery(uuid) TO authenticated,service_role;


-- service専用。配送の受付結果とメール履歴を同じトランザクションで確定する。
CREATE OR REPLACE FUNCTION public.complete_private_rejection_delivery(
 p_delivery_id uuid,p_lease_token uuid,p_provider_id text,p_sent_at timestamptz
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public SET row_security=off AS $$
DECLARE v_delivery public.private_booking_rejection_deliveries%ROWTYPE;v_log public.email_logs%ROWTYPE;
BEGIN
 IF p_provider_id IS NULL OR length(btrim(p_provider_id))=0 OR p_sent_at IS NULL THEN
  RAISE EXCEPTION 'INVALID_DELIVERY_RECEIPT' USING ERRCODE='22023';
 END IF;
 SELECT * INTO v_delivery FROM public.private_booking_rejection_deliveries WHERE id=p_delivery_id FOR UPDATE NOWAIT;
 IF NOT FOUND OR v_delivery.status IS DISTINCT FROM 'sending' OR v_delivery.lease_token IS DISTINCT FROM p_lease_token OR p_lease_token IS NULL THEN
  RAISE EXCEPTION 'DELIVERY_LEASE_LOST' USING ERRCODE='40001';
 END IF;
 SELECT * INTO v_log FROM public.email_logs WHERE id=coalesce(v_delivery.email_log_id,v_delivery.id) FOR UPDATE NOWAIT;
 IF NOT FOUND OR v_log.organization_id IS DISTINCT FROM v_delivery.organization_id
   OR v_log.reservation_id IS DISTINCT FROM v_delivery.reservation_id
   OR v_log.to_email IS DISTINCT FROM v_delivery.customer_email
   OR v_log.body_text IS DISTINCT FROM v_delivery.message_body
   OR v_log.email_type IS DISTINCT FROM 'reservation_cancelled'
   OR (v_log.provider_message_id IS NOT NULL AND v_log.provider_message_id IS DISTINCT FROM p_provider_id)
 THEN RAISE EXCEPTION 'DELIVERY_LOG_CONFLICT' USING ERRCODE='22023'; END IF;
 UPDATE public.email_logs SET provider_message_id=p_provider_id,sent_at=coalesce(sent_at,p_sent_at),
   status=CASE WHEN status IN ('queued','failed') THEN 'sent' ELSE status END,error_message=NULL
 WHERE id=v_log.id;
 UPDATE public.private_booking_rejection_deliveries SET status='sent',provider_message_id=p_provider_id,last_error=NULL,
   lease_token=NULL,lease_until=NULL,updated_at=now() WHERE id=v_delivery.id;
 RETURN true;
END; $$;
REVOKE ALL ON FUNCTION public.complete_private_rejection_delivery(uuid,uuid,text,timestamptz) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.complete_private_rejection_delivery(uuid,uuid,text,timestamptz) TO service_role;

COMMIT;

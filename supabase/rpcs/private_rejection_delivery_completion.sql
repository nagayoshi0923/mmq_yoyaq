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

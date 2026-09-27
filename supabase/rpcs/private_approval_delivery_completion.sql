-- サーバー専用。外部の受付IDとメール履歴を同じトランザクションで確定する。
CREATE OR REPLACE FUNCTION public.complete_private_approval_delivery(
 p_delivery_id uuid,p_lease_token uuid,p_provider_id text,p_sent_at timestamptz
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp SET row_security=off AS $$
DECLARE d public.private_booking_approval_deliveries%ROWTYPE; l public.email_logs%ROWTYPE;
BEGIN
 IF p_provider_id IS NULL OR length(btrim(p_provider_id))=0 OR p_sent_at IS NULL THEN
  RAISE EXCEPTION 'INVALID_DELIVERY_RECEIPT' USING ERRCODE='22023';
 END IF;
 SELECT * INTO d FROM public.private_booking_approval_deliveries WHERE id=p_delivery_id FOR UPDATE NOWAIT;
 IF NOT FOUND OR d.status IS DISTINCT FROM 'sending' OR d.lease_token IS DISTINCT FROM p_lease_token OR p_lease_token IS NULL THEN
  RAISE EXCEPTION 'DELIVERY_LEASE_LOST' USING ERRCODE='40001';
 END IF;
 IF d.provider_payload IS NULL OR d.first_attempt_at IS NULL THEN
  RAISE EXCEPTION 'DELIVERY_NOT_STARTED' USING ERRCODE='22023';
 END IF;
 IF d.provider_message_id IS NOT NULL AND d.provider_message_id IS DISTINCT FROM p_provider_id THEN
  RAISE EXCEPTION 'DELIVERY_RECEIPT_CONFLICT' USING ERRCODE='22023';
 END IF;
 IF d.kind<>'gm_discord' THEN
  SELECT * INTO l FROM public.email_logs WHERE id=coalesce(d.email_log_id,d.id) FOR UPDATE NOWAIT;
  IF NOT FOUND OR l.organization_id IS DISTINCT FROM d.organization_id OR l.reservation_id IS DISTINCT FROM d.reservation_id
   OR l.to_email IS DISTINCT FROM (d.provider_payload->'to'->>0)
   OR l.subject IS DISTINCT FROM (d.provider_payload->>'subject')
   OR l.body_text IS DISTINCT FROM (d.provider_payload->>'text')
   OR l.body_html IS DISTINCT FROM (d.provider_payload->>'html')
   OR l.email_type IS DISTINCT FROM (CASE WHEN d.kind='confirmation_email' THEN 'reservation_confirmed' ELSE 'gm_notification' END)
   OR (l.provider_message_id IS NOT NULL AND l.provider_message_id IS DISTINCT FROM p_provider_id) THEN
   RAISE EXCEPTION 'DELIVERY_LOG_CONFLICT' USING ERRCODE='22023';
  END IF;
  UPDATE public.email_logs SET provider_message_id=p_provider_id,sent_at=coalesce(sent_at,p_sent_at),
   status=CASE WHEN status IN ('queued','failed') THEN 'sent' ELSE status END,error_message=NULL WHERE id=l.id;
 END IF;
 UPDATE public.private_booking_approval_deliveries SET status='sent',provider_message_id=p_provider_id,
  last_error=NULL,lease_token=NULL,lease_until=NULL,updated_at=now() WHERE id=d.id;
 RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.complete_private_approval_delivery(uuid,uuid,text,timestamptz) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.complete_private_approval_delivery(uuid,uuid,text,timestamptz) TO service_role;

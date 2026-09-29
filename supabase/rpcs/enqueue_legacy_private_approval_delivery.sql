-- 認可・保存値の読み込みを行ったEdgeだけが使用する互換入口。外部送信はworkerに集約する。
CREATE OR REPLACE FUNCTION public.enqueue_legacy_private_approval_delivery(
 p_organization_id uuid,p_reservation_id uuid,p_kind text,p_snapshot jsonb,p_correction_id uuid DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp SET row_security=off AS $$
DECLARE r public.reservations%ROWTYPE; recipient text; delivery_key text; existing public.private_booking_approval_deliveries%ROWTYPE; new_id uuid;
BEGIN
 IF p_kind NOT IN ('confirmation_email','gm_email','gm_discord') OR p_kind IS NULL THEN
  RAISE EXCEPTION 'INVALID_DELIVERY_KIND' USING ERRCODE='22023';
 END IF;
 SELECT * INTO STRICT r FROM public.reservations WHERE id=p_reservation_id AND organization_id=p_organization_id FOR UPDATE;
 IF r.schedule_event_id IS NULL OR r.status NOT IN ('confirmed','gm_confirmed')
  OR p_snapshot->>'reservationId' IS DISTINCT FROM r.id::text
  OR p_snapshot->>'organizationId' IS DISTINCT FROM r.organization_id::text
  OR p_snapshot->>'scheduleEventId' IS DISTINCT FROM r.schedule_event_id::text THEN
  RAISE EXCEPTION 'APPROVAL_CHANGED' USING ERRCODE='55000';
 END IF;
 recipient:=CASE WHEN p_kind='confirmation_email' THEN 'customer' ELSE p_snapshot->>'gmId' END;
 IF recipient IS NULL THEN RAISE EXCEPTION 'INVALID_RECIPIENT' USING ERRCODE='22023'; END IF;
 IF p_correction_id IS NULL THEN
  SELECT * INTO existing FROM public.private_booking_approval_deliveries
   WHERE organization_id=r.organization_id AND reservation_id=r.id AND schedule_event_id=r.schedule_event_id
    AND kind=p_kind AND recipient_key=recipient AND compatibility_key IS NULL ORDER BY created_at DESC LIMIT 1;
  IF FOUND THEN RETURN existing.id; END IF;
 ELSIF p_kind<>'confirmation_email' THEN RAISE EXCEPTION 'INVALID_CORRECTION_KIND' USING ERRCODE='22023';
 END IF;
 delivery_key:=CASE WHEN p_correction_id IS NULL THEN 'legacy/'||r.schedule_event_id::text ELSE 'correction/'||p_correction_id::text END
  ||'/'||r.id::text||'/'||p_kind||'/'||recipient;
 SELECT * INTO existing FROM public.private_booking_approval_deliveries WHERE compatibility_key=delivery_key;
 IF FOUND THEN
  IF p_correction_id IS NOT NULL AND (existing.snapshot->>'emailSubject' IS DISTINCT FROM p_snapshot->>'emailSubject'
   OR existing.snapshot->>'templateOverride' IS DISTINCT FROM p_snapshot->>'templateOverride') THEN
   RAISE EXCEPTION 'CORRECTION_REQUEST_CONFLICT' USING ERRCODE='22023';
  END IF;
  RETURN existing.id;
 END IF;
 INSERT INTO public.private_booking_approval_deliveries(compatibility_key,organization_id,reservation_id,schedule_event_id,kind,recipient_key,snapshot)
 VALUES(delivery_key,r.organization_id,r.id,r.schedule_event_id,p_kind,recipient,p_snapshot) RETURNING id INTO new_id;
 IF NOT public.is_private_approval_delivery_current(new_id) THEN
  RAISE EXCEPTION 'APPROVAL_CHANGED' USING ERRCODE='55000';
 END IF;
 RETURN new_id;
END $$;
REVOKE ALL ON FUNCTION public.enqueue_legacy_private_approval_delivery(uuid,uuid,text,jsonb,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.enqueue_legacy_private_approval_delivery(uuid,uuid,text,jsonb,uuid) TO service_role;

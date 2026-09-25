-- 自動リマインドの送信単位。顧客連絡先や本文は複製しない。
CREATE TABLE public.scheduled_reminder_deliveries (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
 reservation_id uuid NOT NULL REFERENCES public.reservations(id) ON DELETE CASCADE,
 schedule_event_id uuid NOT NULL REFERENCES public.schedule_events(id) ON DELETE CASCADE,
 event_date date NOT NULL,
 days_before integer NOT NULL CHECK(days_before BETWEEN 0 AND 365),
 send_time time NOT NULL,
 status text NOT NULL CHECK(status IN ('sending','sent','failed')),
 lease_token uuid NOT NULL DEFAULT gen_random_uuid(),
 attempted_at timestamptz NOT NULL DEFAULT now(),
 created_at timestamptz NOT NULL DEFAULT now(),
 sent_at timestamptz,
 UNIQUE(reservation_id,schedule_event_id,event_date,days_before,send_time)
);
REVOKE ALL ON public.scheduled_reminder_deliveries FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.scheduled_reminder_deliveries TO service_role;
ALTER TABLE public.scheduled_reminder_deliveries ENABLE ROW LEVEL SECURITY;
CREATE OR REPLACE FUNCTION public.claim_scheduled_reminder(
 p_organization_id uuid,p_reservation_id uuid,p_event_id uuid,p_event_date date,p_days_before integer,p_send_time time
) RETURNS TABLE(delivery_id uuid,lease_token uuid)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
 IF p_days_before NOT BETWEEN 0 AND 365 OR p_days_before IS NULL OR p_send_time IS NULL THEN
  RAISE EXCEPTION 'invalid reminder schedule' USING ERRCODE='22023';
 END IF;
 IF NOT EXISTS(SELECT 1 FROM public.reservations r JOIN public.schedule_events e ON e.id=r.schedule_event_id
   WHERE r.id=p_reservation_id AND r.organization_id=p_organization_id AND e.organization_id=p_organization_id
    AND e.id=p_event_id AND e.date=p_event_date AND COALESCE(e.is_cancelled,false)=false
    AND r.status IN ('confirmed','pending','gm_confirmed')) THEN
  RAISE EXCEPTION 'reservation is not eligible' USING ERRCODE='42501';
 END IF;
 RETURN QUERY INSERT INTO public.scheduled_reminder_deliveries AS d
  (organization_id,reservation_id,schedule_event_id,event_date,days_before,send_time,status)
 VALUES(p_organization_id,p_reservation_id,p_event_id,p_event_date,p_days_before,p_send_time,'sending')
 ON CONFLICT(reservation_id,schedule_event_id,event_date,days_before,send_time) DO UPDATE
  SET status='sending',lease_token=gen_random_uuid(),attempted_at=now()
  WHERE (d.status='failed' OR (d.status='sending' AND d.attempted_at<now()-interval '15 minutes'))
    -- プロバイダの冪等キー有効期間外では自動再送しない。
    AND d.created_at>now()-interval '23 hours'
 RETURNING d.id,d.lease_token;
END;
$$;
REVOKE ALL ON FUNCTION public.claim_scheduled_reminder(uuid,uuid,uuid,date,integer,time) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.claim_scheduled_reminder(uuid,uuid,uuid,date,integer,time) TO service_role;
-- 旧cronが既に送信した前日9時の分を引き継ぎ、切替当日の二重送信を防ぐ。
INSERT INTO public.scheduled_reminder_deliveries
 (organization_id,reservation_id,schedule_event_id,event_date,days_before,send_time,status,sent_at)
SELECT r.organization_id,r.id,e.id,e.date,1,'09:00','sent',max(l.sent_at)
FROM public.email_logs l JOIN public.reservations r ON r.id=l.reservation_id AND r.organization_id=l.organization_id
JOIN public.schedule_events e ON e.id=r.schedule_event_id AND e.organization_id=r.organization_id
WHERE l.email_type='reminder' AND l.status='sent' AND e.date >= (now() AT TIME ZONE 'Asia/Tokyo')::date
 AND (l.sent_at AT TIME ZONE 'Asia/Tokyo')::date=e.date-1
GROUP BY r.organization_id,r.id,e.id,e.date
ON CONFLICT(reservation_id,schedule_event_id,event_date,days_before,send_time) DO NOTHING;

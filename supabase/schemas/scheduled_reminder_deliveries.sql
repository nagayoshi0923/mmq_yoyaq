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

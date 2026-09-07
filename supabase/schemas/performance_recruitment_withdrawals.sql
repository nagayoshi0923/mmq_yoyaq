CREATE TABLE public.performance_recruitment_withdrawals (
 request_id uuid PRIMARY KEY,
 organization_id uuid NOT NULL REFERENCES public.organizations(id),
 schedule_event_id uuid NOT NULL REFERENCES public.schedule_events(id),
 reservation_id uuid NOT NULL REFERENCES public.reservations(id),
 notice_id uuid NOT NULL REFERENCES public.performance_recruitment_notices(id),
 withdrawn_count integer NOT NULL CHECK(withdrawn_count>0),
 remaining_count integer NOT NULL CHECK(remaining_count>=0),
 result jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.performance_recruitment_withdrawals ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.performance_recruitment_withdrawals FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT ON public.performance_recruitment_withdrawals TO service_role;

CREATE TABLE public.performance_recruitment_policies (
 organization_id uuid PRIMARY KEY REFERENCES public.organizations(id),
 one_seat_enabled boolean NOT NULL DEFAULT false,
 max_missing_participants smallint NOT NULL DEFAULT 1 CHECK (max_missing_participants BETWEEN 1 AND 2),
 customer_site_url text NOT NULL CHECK (customer_site_url ~ '^https://'),
 updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.performance_recruitment_policies ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.performance_recruitment_policies FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.performance_recruitment_policies TO service_role;

CREATE TABLE public.performance_recruitment_notices (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 schedule_event_id uuid NOT NULL REFERENCES public.performance_recruitment_deadlines(schedule_event_id),
 organization_id uuid NOT NULL REFERENCES public.organizations(id),
 reservation_id uuid NOT NULL REFERENCES public.reservations(id),
 response_token uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(),
 customer_email text,
 kind text NOT NULL DEFAULT 'extension' CHECK(kind IN ('extension','confirmed','cancelled','withdrawn')),
 snapshot jsonb NOT NULL,
 cycle integer NOT NULL DEFAULT 1 CHECK (cycle > 0),
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','sending','sent','failed','expired')),
 attempts integer NOT NULL DEFAULT 0,
 lease_until timestamptz,
 sent_at timestamptz,
 withdrawn_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(schedule_event_id, reservation_id, kind, cycle)
);
ALTER TABLE public.performance_recruitment_notices ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.performance_recruitment_notices FROM PUBLIC, anon, authenticated;
GRANT SELECT, UPDATE, INSERT ON public.performance_recruitment_notices TO service_role;
CREATE INDEX performance_recruitment_notices_pending ON public.performance_recruitment_notices(status, lease_until);

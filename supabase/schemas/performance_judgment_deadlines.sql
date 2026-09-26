CREATE TABLE public.performance_judgment_deadlines (
 schedule_event_id uuid PRIMARY KEY REFERENCES public.schedule_events(id) ON DELETE CASCADE,
 organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
 deadline_at timestamptz NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
REVOKE ALL ON public.performance_judgment_deadlines FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.performance_judgment_deadlines TO service_role;
ALTER TABLE public.performance_judgment_deadlines ENABLE ROW LEVEL SECURITY;

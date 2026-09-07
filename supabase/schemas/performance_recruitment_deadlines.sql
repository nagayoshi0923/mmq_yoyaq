-- 内部の判断理由は公開 schedule_events に保存しない。
CREATE TABLE public.performance_recruitment_deadlines (
  schedule_event_id uuid PRIMARY KEY REFERENCES public.schedule_events(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES public.organizations(id),
  deadline timestamptz NOT NULL,
  reason text NOT NULL CHECK (length(btrim(reason)) BETWEEN 1 AND 2000),
  was_confirmed boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'confirmed', 'cancelled')),
  cycle integer NOT NULL DEFAULT 1 CHECK (cycle > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.performance_recruitment_deadlines ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.performance_recruitment_deadlines FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.performance_recruitment_deadlines TO service_role;

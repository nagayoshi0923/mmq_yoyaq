CREATE TABLE public.private_group_survey_deadlines (
 group_id uuid PRIMARY KEY REFERENCES public.private_groups(id) ON DELETE CASCADE,
 organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
 deadline_at timestamptz NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.private_group_survey_deadlines ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.private_group_survey_deadlines FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.private_group_survey_deadlines TO service_role;

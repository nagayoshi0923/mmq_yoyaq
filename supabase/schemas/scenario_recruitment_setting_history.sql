CREATE TABLE public.scenario_recruitment_setting_history (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 organization_id uuid NOT NULL REFERENCES public.organizations(id),
 organization_scenario_id uuid NOT NULL REFERENCES public.organization_scenarios(id),
 actor_id uuid NOT NULL,
 before_settings jsonb NOT NULL,
 after_settings jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.scenario_recruitment_setting_history ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.scenario_recruitment_setting_history FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT ON public.scenario_recruitment_setting_history TO service_role;
CREATE INDEX scenario_recruitment_history_org ON public.scenario_recruitment_setting_history(organization_id,organization_scenario_id,created_at DESC);

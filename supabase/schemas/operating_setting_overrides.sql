-- 組織共通と個別指定の差分。サービス側APIだけが読み書きする。
-- JSONの未指定キーは従来値、nullは明示的な継承、値ありは個別指定。
CREATE TABLE public.operating_setting_overrides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  store_id uuid REFERENCES public.stores(id) ON DELETE CASCADE,
  organization_scenario_id uuid REFERENCES public.organization_scenarios(id) ON DELETE CASCADE,
  schedule_event_id uuid REFERENCES public.schedule_events(id) ON DELETE CASCADE,
  settings jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(settings) = 'object'),
  revision bigint NOT NULL DEFAULT 1,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (num_nonnulls(store_id, organization_scenario_id, schedule_event_id) <= 1),
  UNIQUE NULLS NOT DISTINCT (organization_id, store_id, organization_scenario_id, schedule_event_id)
);
REVOKE ALL ON public.operating_setting_overrides FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.operating_setting_overrides TO service_role;
ALTER TABLE public.operating_setting_overrides ENABLE ROW LEVEL SECURITY;

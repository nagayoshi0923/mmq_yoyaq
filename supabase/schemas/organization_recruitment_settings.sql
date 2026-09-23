-- 共通設定は管理APIのみからアクセスする。
CREATE TABLE public.organization_recruitment_settings (
 organization_id uuid PRIMARY KEY REFERENCES public.organizations(id),
 mode text NOT NULL DEFAULT 'count' CHECK (mode IN ('count','percent')),
 value integer NOT NULL DEFAULT 2,
 updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 CHECK ((mode='count' AND value BETWEEN 1 AND 20) OR (mode='percent' AND value BETWEEN 1 AND 100))
);
ALTER TABLE public.organization_recruitment_settings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.organization_recruitment_settings FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE ON public.organization_recruitment_settings TO service_role;
CREATE TABLE public.organization_recruitment_setting_history (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 organization_id uuid NOT NULL REFERENCES public.organizations(id),
 actor_id uuid NOT NULL,
 before_settings jsonb NOT NULL,
 after_settings jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
ALTER TABLE public.organization_recruitment_setting_history ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.organization_recruitment_setting_history FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT ON public.organization_recruitment_setting_history TO service_role;

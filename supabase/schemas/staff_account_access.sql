-- スタッフ連携由来の権限を識別する内部記録。解除後の遅延した再昇格を防止する。
CREATE TABLE IF NOT EXISTS public.staff_account_access (
 user_id uuid PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
 organization_id uuid NOT NULL REFERENCES public.organizations(id),
 managed_since timestamptz NOT NULL DEFAULT clock_timestamp()
);
ALTER TABLE public.staff_account_access ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.staff_account_access FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.staff_account_access TO service_role;

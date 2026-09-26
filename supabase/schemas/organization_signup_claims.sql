-- QW-20260917-001 A29: registration grants belong to their creator, not a public org UUID.
CREATE TABLE public.organization_signup_claims (
 organization_id uuid PRIMARY KEY REFERENCES public.organizations(id) ON DELETE CASCADE,
 token_hash bytea NOT NULL,
 email text NOT NULL,
 created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
 expires_at timestamptz NOT NULL DEFAULT (clock_timestamp()+interval '30 minutes'),
 consumed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
 consumed_transaction bigint,
 consumed_at timestamptz
);
ALTER TABLE public.organization_signup_claims ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.organization_signup_claims FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.organization_signup_claims TO service_role;

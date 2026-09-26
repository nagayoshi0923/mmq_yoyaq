-- Guest authentication state; business data belongs to private_group_members.
CREATE TABLE public.private_group_guest_sessions (
 token_hash text PRIMARY KEY,
 member_id uuid NOT NULL REFERENCES public.private_group_members(id) ON DELETE CASCADE,
 expires_at timestamptz NOT NULL,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
ALTER TABLE public.private_group_guest_sessions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.private_group_guest_sessions FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.private_group_guest_sessions TO service_role;
CREATE INDEX private_group_guest_sessions_member_idx ON public.private_group_guest_sessions(member_id);


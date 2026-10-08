-- 貸切グループの主催者（申込者）の引き継ぎ依頼（マイページ改修 段階 3、migration 20261009120000）
-- 書き込みは private_group_handover_* RPC（supabase/rpcs/private_group_handover.sql）だけ。読めるのは当事者と同組織スタッフ。
CREATE TABLE IF NOT EXISTS public.private_group_handover_requests (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
 group_id uuid NOT NULL REFERENCES public.private_groups(id) ON DELETE CASCADE,
 reservation_id uuid REFERENCES public.reservations(id) ON DELETE SET NULL,
 from_member_id uuid REFERENCES public.private_group_members(id) ON DELETE SET NULL,
 to_member_id uuid REFERENCES public.private_group_members(id) ON DELETE SET NULL,
 from_user_id uuid NOT NULL,
 to_user_id uuid NOT NULL,
 status text NOT NULL DEFAULT 'requested' CHECK (status IN ('requested','accepted','declined','cancelled','expired')),
 requested_at timestamptz NOT NULL DEFAULT now(),
 expires_at timestamptz NOT NULL,
 responded_at timestamptz,
 accepted_contact jsonb,
 accepted_policy jsonb,
 previous_customer jsonb,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT private_group_handover_requests_distinct_users CHECK (from_user_id <> to_user_id),
 CONSTRAINT private_group_handover_requests_expiry CHECK (expires_at > requested_at)
);
CREATE UNIQUE INDEX IF NOT EXISTS private_group_handover_requests_one_open ON public.private_group_handover_requests(group_id) WHERE status='requested';
CREATE INDEX IF NOT EXISTS private_group_handover_requests_to_user ON public.private_group_handover_requests(to_user_id) WHERE status='requested';
CREATE INDEX IF NOT EXISTS private_group_handover_requests_from_user ON public.private_group_handover_requests(from_user_id) WHERE status='requested';
CREATE INDEX IF NOT EXISTS private_group_handover_requests_reservation ON public.private_group_handover_requests(reservation_id) WHERE reservation_id IS NOT NULL;
ALTER TABLE public.private_group_handover_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.private_group_handover_requests FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.private_group_handover_requests TO authenticated;
GRANT ALL ON public.private_group_handover_requests TO service_role;
DROP POLICY IF EXISTS private_group_handover_requests_select ON public.private_group_handover_requests;
CREATE POLICY private_group_handover_requests_select ON public.private_group_handover_requests FOR SELECT TO authenticated
 USING (from_user_id=(SELECT auth.uid()) OR to_user_id=(SELECT auth.uid())
  OR ((SELECT public.is_staff_or_admin()) AND organization_id=(SELECT public.get_user_organization_id())));
COMMENT ON TABLE public.private_group_handover_requests IS '貸切グループの主催者（申込者）の引き継ぎ依頼。新主催者の同意で成立。書き込みは private_group_handover_* RPC のみ。';

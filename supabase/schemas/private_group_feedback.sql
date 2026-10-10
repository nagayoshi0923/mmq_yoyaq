-- 正規定義（migration 20261010160000_private_group_memories.sql）。ブラウザの役割には権限を付けない（RPC private_group_after_action / private_group_feedback_staff 経由）
CREATE TABLE IF NOT EXISTS public.private_group_feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL REFERENCES public.private_groups(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  member_id uuid NOT NULL REFERENCES public.private_group_members(id) ON DELETE CASCADE,
  reservation_id uuid REFERENCES public.reservations(id) ON DELETE SET NULL,
  rating smallint NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment text NOT NULL DEFAULT '' CHECK (char_length(comment) <= 2000),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (group_id, member_id)
);
ALTER TABLE public.private_group_feedback ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.private_group_feedback FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.private_group_feedback TO service_role;
CREATE INDEX IF NOT EXISTS idx_private_group_feedback_org ON public.private_group_feedback(organization_id, created_at DESC);
COMMENT ON TABLE public.private_group_feedback IS '公演後の感想（5 段階＋自由記述）。書くのは参加者本人（RPC private_group_after_action）、読むのは店舗のスタッフだけ（private_group_feedback_staff）。メンバー同士では見えない';
ALTER TABLE public.private_group_feedback ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.private_group_feedback FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.private_group_feedback TO service_role;
CREATE INDEX IF NOT EXISTS idx_private_group_feedback_org ON public.private_group_feedback(organization_id, created_at DESC);

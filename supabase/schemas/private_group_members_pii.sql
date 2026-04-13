-- 正規ソース: supabase/schemas/private_group_members_pii.sql
-- 最終更新: 2026-04-14
CREATE TABLE public.private_group_members_pii (
  member_id  UUID PRIMARY KEY REFERENCES public.private_group_members(id) ON DELETE CASCADE,
  guest_name TEXT,
  guest_email TEXT,
  guest_phone TEXT,
  access_pin TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE public.private_group_members_pii IS 'グループメンバーの個人情報（管理者のみアクセス可）';

-- Indexes
CREATE INDEX IF NOT EXISTS idx_private_group_members_pii_email
  ON public.private_group_members_pii(guest_email);

-- RLS
ALTER TABLE public.private_group_members_pii ENABLE ROW LEVEL SECURITY;

-- SELECT: anon 不可
CREATE POLICY "private_group_members_pii_select_anon" ON public.private_group_members_pii
  FOR SELECT TO anon
  USING (false);

-- SELECT: スタッフ/管理者のみ
CREATE POLICY "private_group_members_pii_select_authenticated" ON public.private_group_members_pii
  FOR SELECT TO authenticated
  USING (public.is_staff_or_admin());

-- INSERT: ゲスト登録用（トリガー経由）
CREATE POLICY "private_group_members_pii_insert" ON public.private_group_members_pii
  FOR INSERT
  WITH CHECK (true);

-- UPDATE: スタッフ/管理者のみ
CREATE POLICY "private_group_members_pii_update" ON public.private_group_members_pii
  FOR UPDATE
  USING (public.is_staff_or_admin());

-- DELETE: スタッフ/管理者のみ（delete_guest_member RPC は SECURITY DEFINER で実行）
CREATE POLICY "private_group_members_pii_delete" ON public.private_group_members_pii
  FOR DELETE
  USING (public.is_staff_or_admin());

-- Grants
GRANT SELECT, INSERT ON public.private_group_members_pii TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.private_group_members_pii TO authenticated;

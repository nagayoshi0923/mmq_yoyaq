-- 正規ソース: supabase/schemas/private_group_members_pii.sql
-- 最終更新: 2026-09-27（本番のハッシュ・ロック列とPII権限を同期）
CREATE TABLE public.private_group_members_pii (
  member_id  UUID PRIMARY KEY REFERENCES public.private_group_members(id) ON DELETE CASCADE,
  guest_name TEXT,
  guest_email TEXT,
  guest_phone TEXT,
  access_pin TEXT, -- 旧列。認証には使用しない。
  access_pin_hash TEXT,
  failed_attempts INTEGER NOT NULL DEFAULT 0,
  locked_until TIMESTAMPTZ,
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
-- 20260802130000 で anon、20261003090000 で authenticated の直接アクセスを撤回済み（#280、#818）。
-- RLS の is_staff_or_admin() は組織を見ないため、直接の権限があると他組織のゲスト情報を読み書きできた。
-- この表は所有者権限の関数（join_private_group / authenticate_guest_by_pin_v2・v3 / save_guest_access_pin /
-- sync_private_group_member_pii）だけが使う。
REVOKE ALL ON public.private_group_members_pii FROM anon;
REVOKE ALL ON public.private_group_members_pii FROM authenticated;

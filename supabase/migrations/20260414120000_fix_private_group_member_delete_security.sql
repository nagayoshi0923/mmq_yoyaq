-- ====================================================================
-- セキュリティ修正: private_group_members_pii と delete_guest_member RPC
--
-- 問題1: private_group_members_pii の UPDATE/DELETE ポリシーが USING(true) で
--        anon が任意の行を変更・削除できた。
--
-- 問題2: delete_guest_member() が呼び出し元の権限を検証しておらず、
--        member_id を知っていれば誰でも任意のメンバーを削除できた。
-- ====================================================================

-- ============================================================
-- 1. private_group_members_pii の UPDATE/DELETE ポリシーを制限
-- ============================================================

-- 既存のポリシーを削除
DROP POLICY IF EXISTS "private_group_members_pii_update" ON public.private_group_members_pii;
DROP POLICY IF EXISTS "private_group_members_pii_delete" ON public.private_group_members_pii;

-- UPDATE: スタッフ/管理者のみ（ゲストのPII更新はトリガー経由）
CREATE POLICY "private_group_members_pii_update" ON public.private_group_members_pii
  FOR UPDATE
  USING (public.is_staff_or_admin());

-- DELETE: スタッフ/管理者のみ（delete_guest_member RPC は SECURITY DEFINER で実行）
CREATE POLICY "private_group_members_pii_delete" ON public.private_group_members_pii
  FOR DELETE
  USING (public.is_staff_or_admin());

-- anon から直接の UPDATE/DELETE 権限を剥奪
REVOKE UPDATE, DELETE ON public.private_group_members_pii FROM anon;

-- ============================================================
-- 2. delete_guest_member RPC に呼び出し元の権限検証を追加
--
-- 認証済み（authenticated）:
--   - 本人（user_id = auth.uid()）または
--   - そのグループの主催者のみ実行可
--
-- 未認証（anon/ゲスト）:
--   - invite_code でグループ所属を確認
--   - member_id だけでは削除不可
-- ============================================================

CREATE OR REPLACE FUNCTION public.delete_guest_member(
  p_member_id  UUID,
  p_invite_code TEXT DEFAULT NULL  -- anon 用: グループ所属確認
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_member RECORD;
BEGIN
  SELECT * INTO v_member
  FROM public.private_group_members
  WHERE id = p_member_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Member not found' USING ERRCODE = 'P0404';
  END IF;

  IF v_member.is_organizer THEN
    RAISE EXCEPTION 'Cannot delete organizer' USING ERRCODE = 'P0400';
  END IF;

  -- --------------------------------------------------------
  -- 認証済みユーザー: 本人 or そのグループの主催者のみ
  -- --------------------------------------------------------
  IF auth.uid() IS NOT NULL THEN
    -- 本人による退出
    IF v_member.user_id = auth.uid() THEN
      NULL; -- OK

    -- グループの主催者による削除
    ELSIF EXISTS (
      SELECT 1 FROM public.private_group_members
      WHERE group_id = v_member.group_id
        AND user_id = auth.uid()
        AND is_organizer = true
    ) THEN
      NULL; -- OK

    ELSE
      RAISE EXCEPTION 'Unauthorized: not a member or organizer of this group'
        USING ERRCODE = 'P0401';
    END IF;

  -- --------------------------------------------------------
  -- 未認証ゲスト: invite_code でグループ所属を確認
  -- --------------------------------------------------------
  ELSE
    IF p_invite_code IS NULL OR p_invite_code = '' THEN
      RAISE EXCEPTION 'Invite code required for guest deletion'
        USING ERRCODE = 'P0401';
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM public.private_groups pg
      WHERE pg.id = v_member.group_id
        AND pg.invite_code = p_invite_code
    ) THEN
      RAISE EXCEPTION 'Invalid invite code'
        USING ERRCODE = 'P0401';
    END IF;
  END IF;

  DELETE FROM public.private_group_members WHERE id = p_member_id;
  RETURN TRUE;
END;
$$;

COMMENT ON FUNCTION public.delete_guest_member IS
  'ゲストメンバーを削除する。認証済みは本人/主催者のみ、未認証は invite_code で所属確認。';

-- 確認ログ
DO $$
BEGIN
  RAISE NOTICE '🔒 セキュリティ修正完了:';
  RAISE NOTICE '  - private_group_members_pii: anon の UPDATE/DELETE を禁止';
  RAISE NOTICE '  - delete_guest_member: 呼び出し元の権限検証を追加（認証=本人/主催者, ゲスト=invite_code確認）';
END $$;

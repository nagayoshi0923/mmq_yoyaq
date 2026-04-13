-- 正規ソース: supabase/rpcs/delete_guest_member.sql
-- 最終更新: 2026-04-14
--
-- ゲストメンバーを削除する。
-- 認証済みは本人/主催者のみ、未認証は invite_code で所属確認。

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
    IF v_member.user_id = auth.uid() THEN
      NULL; -- OK: 本人による退出

    ELSIF EXISTS (
      SELECT 1 FROM public.private_group_members
      WHERE group_id = v_member.group_id
        AND user_id = auth.uid()
        AND is_organizer = true
    ) THEN
      NULL; -- OK: グループの主催者による削除

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

COMMENT ON FUNCTION public.delete_guest_member(UUID, TEXT) IS
  'ゲストメンバーを削除する。認証済みは本人/主催者のみ、未認証は invite_code で所属確認。';

GRANT EXECUTE ON FUNCTION public.delete_guest_member(UUID, TEXT) TO anon;
GRANT EXECUTE ON FUNCTION public.delete_guest_member(UUID, TEXT) TO authenticated;

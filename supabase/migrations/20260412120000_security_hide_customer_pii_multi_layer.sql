-- ====================================================================
-- セキュリティ強化: 顧客PII の多層防御
--
-- Layer 1: private_group_members から guest_name, guest_email を削除
-- Layer 2: private_groups から financial / notes を非公開化
-- Layer 3: SECURITY DEFINER RPC で招待コード検証付きデータ返却
-- ====================================================================

-- ============================================================
-- Layer 1: private_group_members — 名前・メールも非公開化
-- ============================================================
-- 前のマイグレーションでは guest_name, guest_email を残していたが、
-- 顧客の本名・ニックネーム・メールアドレスも一切公開しない。
REVOKE SELECT ON public.private_group_members FROM anon;
GRANT SELECT (
  id, group_id, user_id,
  is_organizer, status, joined_at, created_at
) ON public.private_group_members TO anon;

-- ============================================================
-- Layer 2: private_groups — 財務・内部情報を非公開化
-- ============================================================
REVOKE SELECT ON public.private_groups FROM anon;
GRANT SELECT (
  id, organization_id, scenario_master_id,
  organizer_id, name, invite_code, status,
  reservation_id, target_participant_count, preferred_store_ids,
  character_assignment_method, character_assignments,
  created_at, updated_at
) ON public.private_groups TO anon;

-- ============================================================
-- Layer 3: SECURITY DEFINER RPC — 招待コード検証付きデータ返却
-- ============================================================

-- 3a: 招待コードで検証した上でメンバー情報を返す
-- guest_name のみ返す（email, phone, payment 等は一切含まない）
DROP FUNCTION IF EXISTS public.get_group_members_by_invite_code(TEXT);
CREATE OR REPLACE FUNCTION public.get_group_members_by_invite_code(
  p_invite_code TEXT
)
RETURNS TABLE (
  id UUID,
  group_id UUID,
  user_id UUID,
  guest_name TEXT,
  is_organizer BOOLEAN,
  status TEXT,
  joined_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT
    m.id, m.group_id, m.user_id, m.guest_name,
    m.is_organizer, m.status, m.joined_at, m.created_at
  FROM private_group_members m
  JOIN private_groups g ON g.id = m.group_id
  WHERE g.invite_code = p_invite_code;
$$;

GRANT EXECUTE ON FUNCTION public.get_group_members_by_invite_code(TEXT) TO anon;
GRANT EXECUTE ON FUNCTION public.get_group_members_by_invite_code(TEXT) TO authenticated;

-- 3b: グループIDで検証した上でメンバー情報を返す（認証済みユーザー用）
DROP FUNCTION IF EXISTS public.get_group_members_by_group_id(UUID);
CREATE OR REPLACE FUNCTION public.get_group_members_by_group_id(
  p_group_id UUID
)
RETURNS TABLE (
  id UUID,
  group_id UUID,
  user_id UUID,
  guest_name TEXT,
  guest_email TEXT,
  is_organizer BOOLEAN,
  status TEXT,
  joined_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
BEGIN
  -- 認証チェック: ログイン済みユーザーのみ
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  RETURN QUERY
  SELECT
    m.id, m.group_id, m.user_id, m.guest_name, m.guest_email,
    m.is_organizer, m.status, m.joined_at, m.created_at
  FROM private_group_members m
  WHERE m.group_id = p_group_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_group_members_by_group_id(UUID) TO authenticated;

-- 3c: 自分のメンバー情報を取得する（ゲスト用 — PINで認証済みのセッション）
DROP FUNCTION IF EXISTS public.get_my_member_info(UUID);
CREATE OR REPLACE FUNCTION public.get_my_member_info(
  p_member_id UUID
)
RETURNS TABLE (
  id UUID,
  group_id UUID,
  user_id UUID,
  guest_name TEXT,
  guest_email TEXT,
  is_organizer BOOLEAN,
  status TEXT,
  joined_at TIMESTAMPTZ
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT
    m.id, m.group_id, m.user_id, m.guest_name, m.guest_email,
    m.is_organizer, m.status, m.joined_at
  FROM private_group_members m
  WHERE m.id = p_member_id;
$$;

GRANT EXECUTE ON FUNCTION public.get_my_member_info(UUID) TO anon;
GRANT EXECUTE ON FUNCTION public.get_my_member_info(UUID) TO authenticated;

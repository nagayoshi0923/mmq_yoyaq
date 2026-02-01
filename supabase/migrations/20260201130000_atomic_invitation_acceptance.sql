-- =============================================================================
-- 🔒 セキュリティ修正: 招待トークン受諾のアトミック処理
-- 
-- 問題: 同時に同じトークンで複数リクエストが来た場合、両方が通る可能性がある（競合状態）
-- 解決: UPDATE ... WHERE ... RETURNING を使用してアトミックに処理
-- =============================================================================

-- アトミックな招待受諾関数
CREATE OR REPLACE FUNCTION accept_invitation_atomic(
  p_token TEXT,
  p_user_id UUID DEFAULT NULL
)
RETURNS TABLE (
  id UUID,
  organization_id UUID,
  email TEXT,
  role TEXT,
  expires_at TIMESTAMPTZ,
  accepted_at TIMESTAMPTZ,
  success BOOLEAN,
  error_message TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_invitation RECORD;
BEGIN
  -- 🔒 アトミックに招待を更新（競合状態を防止）
  -- FOR UPDATE でロックし、同時実行を防ぐ
  UPDATE organization_invitations
  SET accepted_at = NOW()
  WHERE token = p_token
    AND accepted_at IS NULL
    AND expires_at > NOW()
  RETURNING 
    organization_invitations.id,
    organization_invitations.organization_id,
    organization_invitations.email,
    organization_invitations.role,
    organization_invitations.expires_at,
    organization_invitations.accepted_at
  INTO v_invitation;

  IF NOT FOUND THEN
    -- 招待が見つからない、既に使用済み、または期限切れ
    -- 詳細な理由を特定
    SELECT 
      oi.id,
      oi.organization_id,
      oi.email,
      oi.role,
      oi.expires_at,
      oi.accepted_at
    INTO v_invitation
    FROM organization_invitations oi
    WHERE oi.token = p_token;

    IF NOT FOUND THEN
      RETURN QUERY SELECT 
        NULL::UUID, NULL::UUID, NULL::TEXT, NULL::TEXT, 
        NULL::TIMESTAMPTZ, NULL::TIMESTAMPTZ,
        false, '招待が見つかりません'::TEXT;
      RETURN;
    ELSIF v_invitation.accepted_at IS NOT NULL THEN
      RETURN QUERY SELECT 
        v_invitation.id, v_invitation.organization_id, v_invitation.email,
        v_invitation.role, v_invitation.expires_at, v_invitation.accepted_at,
        false, 'この招待は既に使用されています'::TEXT;
      RETURN;
    ELSIF v_invitation.expires_at <= NOW() THEN
      RETURN QUERY SELECT 
        v_invitation.id, v_invitation.organization_id, v_invitation.email,
        v_invitation.role, v_invitation.expires_at, v_invitation.accepted_at,
        false, '招待の有効期限が切れています'::TEXT;
      RETURN;
    END IF;
  END IF;

  -- 成功
  RETURN QUERY SELECT 
    v_invitation.id,
    v_invitation.organization_id,
    v_invitation.email,
    v_invitation.role,
    v_invitation.expires_at,
    v_invitation.accepted_at,
    true,
    NULL::TEXT;
END;
$$;

-- 匿名ユーザーからも呼び出し可能にする（招待受諾時は未ログインの場合がある）
GRANT EXECUTE ON FUNCTION accept_invitation_atomic TO anon, authenticated;

COMMENT ON FUNCTION accept_invitation_atomic IS
'招待トークンをアトミックに受諾する。競合状態を防ぎ、同じトークンの二重使用を防止する。';

-- 確認
DO $$
BEGIN
  RAISE NOTICE '✅ accept_invitation_atomic 関数を作成しました';
  RAISE NOTICE '   - 競合状態を防止するアトミックな更新';
  RAISE NOTICE '   - 詳細なエラーメッセージを返却';
END $$;

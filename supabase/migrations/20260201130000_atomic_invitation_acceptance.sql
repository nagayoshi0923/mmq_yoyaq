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
AS $func$
DECLARE
  v_invitation RECORD;
BEGIN
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
$func$;

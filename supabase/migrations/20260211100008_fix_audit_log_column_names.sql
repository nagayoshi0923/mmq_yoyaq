-- =============================================================================
-- 修正: audit_logs トリガー関数のカラム名を正しいものに修正
-- table_name → resource_type, record_id → resource_id
-- =============================================================================

-- 1. 組織設定変更の監査トリガー
CREATE OR REPLACE FUNCTION public.audit_organization_settings_changes()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
BEGIN
  v_user_id := auth.uid();
  
  IF TG_OP = 'UPDATE' THEN
    INSERT INTO audit_logs (user_id, action, resource_type, resource_id, old_values, new_values)
    VALUES (
      v_user_id,
      'SETTINGS_UPDATE',
      TG_TABLE_NAME,
      COALESCE(NEW.id, NEW.organization_id),
      row_to_json(OLD)::JSONB,
      row_to_json(NEW)::JSONB
    );
  END IF;
  
  RETURN NEW;
END;
$$;

-- 2. スタッフ変更の監査トリガー
CREATE OR REPLACE FUNCTION public.audit_staff_changes()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_action TEXT;
  v_user_id UUID;
BEGIN
  v_user_id := auth.uid();
  
  IF TG_OP = 'INSERT' THEN
    v_action := 'INSERT';
    INSERT INTO audit_logs (user_id, action, resource_type, resource_id, new_values)
    VALUES (v_user_id, v_action, 'staff', NEW.id, row_to_json(NEW)::JSONB);
    RETURN NEW;
    
  ELSIF TG_OP = 'UPDATE' THEN
    v_action := 'UPDATE';
    IF OLD.role IS DISTINCT FROM NEW.role 
       OR OLD.status IS DISTINCT FROM NEW.status
       OR OLD.email IS DISTINCT FROM NEW.email
       OR OLD.user_id IS DISTINCT FROM NEW.user_id THEN
      INSERT INTO audit_logs (user_id, action, resource_type, resource_id, old_values, new_values)
      VALUES (
        v_user_id, 
        v_action, 
        'staff', 
        NEW.id,
        jsonb_build_object(
          'role', OLD.role,
          'status', OLD.status,
          'email', OLD.email,
          'user_id', OLD.user_id
        ),
        jsonb_build_object(
          'role', NEW.role,
          'status', NEW.status,
          'email', NEW.email,
          'user_id', NEW.user_id
        )
      );
    END IF;
    RETURN NEW;
    
  ELSIF TG_OP = 'DELETE' THEN
    v_action := 'DELETE';
    INSERT INTO audit_logs (user_id, action, resource_type, resource_id, old_values)
    VALUES (v_user_id, v_action, 'staff', OLD.id, row_to_json(OLD)::JSONB);
    RETURN OLD;
  END IF;
  
  RETURN NULL;
END;
$$;

-- 3. 招待承諾の監査トリガー
CREATE OR REPLACE FUNCTION public.audit_invitation_acceptance()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
BEGIN
  IF OLD.accepted_at IS NULL AND NEW.accepted_at IS NOT NULL THEN
    v_user_id := auth.uid();
    
    INSERT INTO audit_logs (user_id, action, resource_type, resource_id, new_values)
    VALUES (
      v_user_id,
      'INVITATION_ACCEPTED',
      'organization_invitations',
      NEW.id,
      jsonb_build_object(
        'email', NEW.email,
        'role', NEW.role,
        'organization_id', NEW.organization_id,
        'accepted_at', NEW.accepted_at
      )
    );
  END IF;
  
  RETURN NEW;
END;
$$;

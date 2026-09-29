-- 本番から取得した関数本文と実行属性を復元する。
BEGIN;
CREATE OR REPLACE FUNCTION public.audit_staff_changes()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$;
COMMIT;

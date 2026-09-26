CREATE OR REPLACE FUNCTION public.get_user_organization_id()
RETURNS uuid LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO public,pg_temp AS $function$
DECLARE v_user public.users%ROWTYPE; v_staff public.staff%ROWTYPE;
BEGIN
 SELECT * INTO v_user FROM public.users WHERE id=auth.uid();
 IF NOT FOUND THEN RETURN NULL; END IF;
 -- License administration is independent of staff employment.
 IF v_user.role='license_admin' THEN RETURN v_user.organization_id; END IF;
 SELECT * INTO v_staff FROM public.staff WHERE user_id=auth.uid();
 IF FOUND THEN
   IF v_staff.status IN ('inactive','resigned') THEN RETURN NULL; END IF;
   RETURN coalesce(v_user.organization_id,v_staff.organization_id);
 END IF;
 IF EXISTS(SELECT 1 FROM public.staff_account_access WHERE user_id=auth.uid()) THEN RETURN NULL; END IF;
 -- Preserve pre-existing profiles without a staff lifecycle (including invitations).
 RETURN v_user.organization_id;
END;
$function$;

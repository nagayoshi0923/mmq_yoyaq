DROP TRIGGER IF EXISTS guard_staff_derived_user_role ON public.users;
DROP FUNCTION IF EXISTS public.guard_staff_derived_user_role();
-- Roll back API/frontend first. Existing profile role values remain as committed.
DROP FUNCTION IF EXISTS public.admin_link_staff_account(uuid,uuid,uuid,text);
DROP TRIGGER IF EXISTS sync_staff_account_access ON public.staff;
DROP TRIGGER IF EXISTS guard_staff_account_change ON public.staff;
DROP FUNCTION IF EXISTS public.sync_staff_account_access();
DROP FUNCTION IF EXISTS public.guard_staff_account_change();
-- staff_account_access is retained to preserve managed-access provenance.
CREATE TRIGGER staff_unlink_trigger AFTER UPDATE ON public.staff FOR EACH ROW EXECUTE FUNCTION public.update_user_role_on_staff_unlink();

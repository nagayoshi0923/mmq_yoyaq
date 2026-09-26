-- フロント/APIを旧版へ戻した後にのみ使用。担当データは巻き戻さない。
DROP TRIGGER IF EXISTS assignment_scenario_membership_guard ON public.staff_scenario_assignments;
DROP TRIGGER IF EXISTS audit_assignment_insert_update ON public.staff_scenario_assignments;
DROP FUNCTION IF EXISTS public.enforce_assignment_scenario_membership();
DROP FUNCTION IF EXISTS public.audit_assignment_updates();
DROP FUNCTION IF EXISTS public.replace_staff_assignments_atomic(uuid,uuid,jsonb,jsonb);
DROP FUNCTION IF EXISTS public.replace_scenario_assignments_atomic(uuid,uuid,uuid[],jsonb,text);
DROP FUNCTION IF EXISTS public.delete_organization_scenario_atomic(uuid,uuid);
DROP FUNCTION IF EXISTS public.assignment_state(uuid,uuid,uuid);
DROP FUNCTION IF EXISTS public.normalize_assignment_state(jsonb);

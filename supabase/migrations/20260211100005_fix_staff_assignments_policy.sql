-- staff_scenario_assignments のレガシーポリシーを削除
DROP POLICY IF EXISTS "staff_scenario_assignments_select_all" ON public.staff_scenario_assignments;
DROP POLICY IF EXISTS "staff_scenario_assignments_org_policy" ON public.staff_scenario_assignments;
DROP POLICY IF EXISTS "staff_scenario_assignments_strict" ON public.staff_scenario_assignments;
-- "Enable read access for all users" も念のため
DROP POLICY IF EXISTS "Enable read access for all users" ON public.staff_scenario_assignments;

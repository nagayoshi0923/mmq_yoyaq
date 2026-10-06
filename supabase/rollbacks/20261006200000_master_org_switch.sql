-- rollback: マスターの切り替えを取り除き、3 表の決まりと「組織の管理者」の判定を 2026-10-06 の応急の状態に戻す
DROP FUNCTION IF EXISTS public.platform_master_switch_organization(uuid);
DROP FUNCTION IF EXISTS public.platform_master_organizations();
DROP POLICY IF EXISTS org_scope_restrict_update ON public.coupon_usages;
DROP POLICY IF EXISTS org_scope_restrict_delete ON public.coupon_usages;
DROP POLICY IF EXISTS inventory_consistency_logs_admin_only ON public.inventory_consistency_logs;
CREATE POLICY inventory_consistency_logs_admin_only ON public.inventory_consistency_logs FOR ALL TO public USING (is_org_admin());
DROP POLICY IF EXISTS admin_can_manage_scenario_import_aliases ON public.scenario_import_aliases;
CREATE POLICY admin_can_manage_scenario_import_aliases ON public.scenario_import_aliases FOR ALL TO authenticated USING (is_org_admin()) WITH CHECK (is_org_admin());
CREATE OR REPLACE FUNCTION public.is_org_admin()
 RETURNS boolean
 LANGUAGE sql
 STABLE
AS $function$
  SELECT COALESCE(
    (SELECT role = 'admin' AND organization_id = 'a0000000-0000-0000-0000-000000000001'::uuid FROM public.users WHERE id = auth.uid() LIMIT 1),
    false
  );
$function$;

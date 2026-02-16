-- キット管理RLSポリシーを元に戻す（admin/owner/org_adminのみ操作可能）

-- ==========================================================
-- 1. scenario_kit_locations のUPDATEポリシーを admin/owner のみに戻す
-- ==========================================================

DROP POLICY IF EXISTS "scenario_kit_locations_update_policy" ON public.scenario_kit_locations;

CREATE POLICY "scenario_kit_locations_update_policy" ON public.scenario_kit_locations
  FOR UPDATE USING (
    organization_id IN (
      SELECT staff.organization_id
      FROM public.staff
      WHERE staff.user_id = auth.uid()
        AND (('admin'::text = ANY (staff.role)) OR ('owner'::text = ANY (staff.role)))
    )
  )
  WITH CHECK (
    organization_id IN (
      SELECT staff.organization_id
      FROM public.staff
      WHERE staff.user_id = auth.uid()
        AND (('admin'::text = ANY (staff.role)) OR ('owner'::text = ANY (staff.role)))
    )
  );

-- ==========================================================
-- 2. kit_transfer_completions のUPDATEポリシーを admin/org_admin のみに戻す
-- ==========================================================

DROP POLICY IF EXISTS "kit_transfer_completions_update_policy" ON public.kit_transfer_completions;

CREATE POLICY "kit_transfer_completions_update_policy" ON public.kit_transfer_completions
  FOR UPDATE USING (
    organization_id = get_user_organization_id() AND (is_admin() OR is_org_admin())
  )
  WITH CHECK (
    organization_id = get_user_organization_id() AND (is_admin() OR is_org_admin())
  );

-- ==========================================================
-- 完了
-- ==========================================================

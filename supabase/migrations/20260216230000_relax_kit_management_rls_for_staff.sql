-- キット管理RLSポリシーの緩和（組織のスタッフ全員が操作可能）

-- ==========================================================
-- 1. scenario_kit_locations のUPDATEポリシーを組織スタッフ全員に緩和
-- ==========================================================

DROP POLICY IF EXISTS "scenario_kit_locations_update_policy" ON public.scenario_kit_locations;

CREATE POLICY "scenario_kit_locations_update_policy" ON public.scenario_kit_locations
  FOR UPDATE USING (
    organization_id IN (
      SELECT organization_id FROM public.staff WHERE user_id = auth.uid()
    )
  )
  WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM public.staff WHERE user_id = auth.uid()
    )
  );

-- ==========================================================
-- 2. kit_transfer_completions のUPDATEポリシーを組織スタッフ全員に緩和
-- ==========================================================

DROP POLICY IF EXISTS "kit_transfer_completions_update_policy" ON public.kit_transfer_completions;

CREATE POLICY "kit_transfer_completions_update_policy" ON public.kit_transfer_completions
  FOR UPDATE USING (
    organization_id IN (
      SELECT organization_id FROM public.staff WHERE user_id = auth.uid()
    )
  )
  WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM public.staff WHERE user_id = auth.uid()
    )
  );

-- ==========================================================
-- 完了
-- ==========================================================

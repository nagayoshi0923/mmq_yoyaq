-- キット管理RLSポリシーの修正
-- 問題: scenario_kit_locations と kit_transfer_completions の UPDATE ポリシーが
-- admin/owner/org_admin のみに制限されており、一般スタッフがキット設置・回収操作ができない

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

COMMENT ON POLICY "scenario_kit_locations_update_policy" ON public.scenario_kit_locations IS
  '組織のスタッフ全員がキット位置を更新可能（設置完了時に必要）';

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

COMMENT ON POLICY "kit_transfer_completions_update_policy" ON public.kit_transfer_completions IS
  '組織のスタッフ全員がキット移動完了状態を更新可能（設置・回収操作に必要）';

-- ==========================================================
-- 完了
-- ==========================================================

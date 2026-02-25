-- scenario_kit_locations の INSERT ポリシーをスタッフ全員に緩和
-- 問題: キット移動機能（upsert）で新規キット位置登録時にスタッフがINSERTできない
-- 
-- 背景:
-- - handleMoveKit → kitApi.setKitLocation で upsert を使用
-- - UPDATE は 20260216230000 で緩和済み
-- - INSERT は admin/owner のみのままだった

-- ==========================================================
-- 1. scenario_kit_locations の INSERT ポリシーを組織スタッフ全員に緩和
-- ==========================================================

DROP POLICY IF EXISTS "scenario_kit_locations_insert_policy" ON public.scenario_kit_locations;

CREATE POLICY "scenario_kit_locations_insert_policy" ON public.scenario_kit_locations
  FOR INSERT WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM public.staff WHERE user_id = auth.uid()
    )
  );

COMMENT ON POLICY "scenario_kit_locations_insert_policy" ON public.scenario_kit_locations IS
  '組織のスタッフ全員がキット位置を登録可能（キット移動・初期設定に必要）';

-- ==========================================================
-- 完了
-- ==========================================================

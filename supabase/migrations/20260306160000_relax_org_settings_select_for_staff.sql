-- organization_settings のSELECTポリシーをスタッフ全員に緩和
-- 問題: スタッフがtime_slot_settings等を読めず406エラー
-- 解決: SELECTは組織のスタッフ全員に許可（書き込みはadminのみ）

-- 既存のSELECTポリシーを削除
DROP POLICY IF EXISTS "organization_settings_select_own_org" ON public.organization_settings;

-- SELECTは組織のスタッフ全員に許可
CREATE POLICY "organization_settings_select_own_org" ON public.organization_settings
  FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id FROM public.staff WHERE user_id = auth.uid()
    )
  );

COMMENT ON POLICY "organization_settings_select_own_org" ON public.organization_settings IS
  '組織のスタッフ全員が設定を閲覧可能（時間帯設定等の参照に必要）';

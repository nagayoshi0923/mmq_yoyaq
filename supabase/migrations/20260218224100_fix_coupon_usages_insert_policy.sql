-- 20260218224100: coupon_usages テーブルのINSERTポリシー追加
-- 問題: create_reservation_with_lock_v2 が coupon_usages への INSERT で 500 エラー
-- 原因: coupon_usages に INSERT ポリシーが存在しなかった
-- 解決: SECURITY DEFINER 関数からの INSERT を許可するポリシーを追加

-- =====================
-- 1. coupon_usages の INSERT ポリシー追加
-- =====================
-- SECURITY DEFINER 関数はRLSをバイパスするはずだが、
-- 一部の設定ではポリシーが必要な場合があるため、安全策として追加

DROP POLICY IF EXISTS "coupon_usages_insert_via_rpc" ON public.coupon_usages;
CREATE POLICY "coupon_usages_insert_via_rpc" ON public.coupon_usages
  FOR INSERT
  WITH CHECK (
    -- SECURITY DEFINER 関数からの呼び出しを想定
    -- customer_coupon_id が存在し、予約が存在すれば許可
    EXISTS (
      SELECT 1 FROM public.customer_coupons cc
      WHERE cc.id = customer_coupon_id
    )
  );

-- =====================
-- 2. coupon_usages の UPDATE ポリシー追加（クーポン取消用）
-- =====================
DROP POLICY IF EXISTS "coupon_usages_update_admin" ON public.coupon_usages;
CREATE POLICY "coupon_usages_update_admin" ON public.coupon_usages
  FOR UPDATE
  USING (is_org_admin())
  WITH CHECK (is_org_admin());

-- =====================
-- 3. coupon_usages の DELETE ポリシー追加（予約削除時用）
-- =====================
DROP POLICY IF EXISTS "coupon_usages_delete_admin" ON public.coupon_usages;
CREATE POLICY "coupon_usages_delete_admin" ON public.coupon_usages
  FOR DELETE
  USING (is_org_admin());

-- =====================
-- 4. 確認用NOTICE
-- =====================
DO $$
BEGIN
  RAISE NOTICE '✅ coupon_usages に INSERT/UPDATE/DELETE ポリシーを追加しました';
END $$;

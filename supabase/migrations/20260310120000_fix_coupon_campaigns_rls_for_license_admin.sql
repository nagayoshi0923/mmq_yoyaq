-- =============================================================================
-- 20260310120000: クーポンキャンペーンRLSポリシー修正
-- =============================================================================
-- is_org_admin() は role='admin' のみチェックするが、
-- license_admin も管理権限を持つため is_admin() に変更

-- INSERTポリシー
DROP POLICY IF EXISTS "coupon_campaigns_insert_admin" ON public.coupon_campaigns;
CREATE POLICY "coupon_campaigns_insert_admin" ON public.coupon_campaigns
  FOR INSERT
  WITH CHECK (
    organization_id = get_user_organization_id()
    AND is_admin()
  );

-- UPDATEポリシー
DROP POLICY IF EXISTS "coupon_campaigns_update_admin" ON public.coupon_campaigns;
CREATE POLICY "coupon_campaigns_update_admin" ON public.coupon_campaigns
  FOR UPDATE
  USING (
    organization_id = get_user_organization_id()
    AND is_admin()
  )
  WITH CHECK (
    organization_id = get_user_organization_id()
    AND is_admin()
  );

-- customer_coupons のINSERTポリシーも修正
DROP POLICY IF EXISTS "customer_coupons_insert_admin" ON public.customer_coupons;
CREATE POLICY "customer_coupons_insert_admin" ON public.customer_coupons
  FOR INSERT
  WITH CHECK (
    organization_id = get_user_organization_id()
    AND is_admin()
  );

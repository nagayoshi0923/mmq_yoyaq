-- customer_coupons に顧客自身の UPDATE ポリシーを追加
-- 従来 UPDATE ポリシーがなかったため、もぎる処理が RLS でブロックされていた

-- coupon_usages の INSERT ポリシーも追加（顧客が自分のクーポン使用を記録できるように）
DROP POLICY IF EXISTS "coupon_usages_insert_customer" ON public.coupon_usages;
CREATE POLICY "coupon_usages_insert_customer" ON public.coupon_usages
  FOR INSERT
  WITH CHECK (
    customer_coupon_id IN (
      SELECT id FROM public.customer_coupons
      WHERE customer_id IN (
        SELECT id FROM public.customers WHERE user_id = auth.uid()
      )
    )
  );

-- customer_coupons の UPDATE ポリシーを追加（顧客が自分のクーポンを使用済みに更新できるように）
DROP POLICY IF EXISTS "customer_coupons_update_customer" ON public.customer_coupons;
CREATE POLICY "customer_coupons_update_customer" ON public.customer_coupons
  FOR UPDATE
  USING (
    customer_id IN (
      SELECT id FROM public.customers WHERE user_id = auth.uid()
    )
  )
  WITH CHECK (
    customer_id IN (
      SELECT id FROM public.customers WHERE user_id = auth.uid()
    )
  );

-- 管理者の UPDATE ポリシーも追加
DROP POLICY IF EXISTS "customer_coupons_update_admin" ON public.customer_coupons;
CREATE POLICY "customer_coupons_update_admin" ON public.customer_coupons
  FOR UPDATE
  USING (
    organization_id = get_user_organization_id() AND is_org_admin()
  )
  WITH CHECK (
    organization_id = get_user_organization_id() AND is_org_admin()
  );

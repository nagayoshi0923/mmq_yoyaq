-- customers_select ポリシーの無限再帰を修正
--
-- 問題: customers_select が reservations を EXISTS で参照
--       → reservations の RLS が customers を参照 → 無限ループ
--
-- 解決: SECURITY DEFINER 関数経由でサブクエリを実行（RLS をバイパス）

-- ① 接点チェック用の SECURITY DEFINER 関数（RLS をバイパスするので再帰しない）
CREATE OR REPLACE FUNCTION public.customer_has_org_connection(p_customer_id uuid, p_org_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM reservations
    WHERE customer_id = p_customer_id
      AND organization_id = p_org_id
  )
  OR EXISTS (
    SELECT 1
    FROM private_groups pg
    JOIN private_group_members pgm ON pgm.group_id = pg.id
    JOIN customers c ON c.id = p_customer_id
    WHERE pg.organization_id = p_org_id
      AND c.user_id IS NOT NULL
      AND pgm.user_id = c.user_id
  )
$$;

-- ② 既存の SELECT ポリシーを差し替え
DROP POLICY IF EXISTS "customers_select" ON public.customers;

CREATE POLICY "customers_select"
ON public.customers FOR SELECT
USING (
  -- 本人
  (user_id IS NOT NULL AND user_id = auth.uid())
  OR
  -- license_admin
  public.is_license_admin()
  OR
  (
    public.is_staff_or_admin()
    AND (
      -- ゲスト顧客: org 一致
      (organization_id IS NOT NULL AND organization_id = public.get_user_organization_id())
      OR
      -- プラットフォーム顧客: SECURITY DEFINER 関数で接点チェック（再帰しない）
      (
        organization_id IS NULL
        AND public.customer_has_org_connection(customers.id, public.get_user_organization_id())
      )
    )
  )
);

-- ③ UPDATE ポリシーも同様に修正
DROP POLICY IF EXISTS "customers_update" ON public.customers;

CREATE POLICY "customers_update"
ON public.customers FOR UPDATE
USING (
  (user_id IS NOT NULL AND user_id = auth.uid())
  OR
  public.is_license_admin()
  OR
  (
    public.is_staff_or_admin()
    AND (
      (organization_id IS NOT NULL AND organization_id = public.get_user_organization_id())
      OR
      (
        organization_id IS NULL
        AND public.customer_has_org_connection(customers.id, public.get_user_organization_id())
      )
    )
  )
)
WITH CHECK (
  (user_id IS NOT NULL AND user_id = auth.uid())
  OR
  public.is_license_admin()
  OR
  (
    public.is_staff_or_admin()
    AND (
      (organization_id IS NOT NULL AND organization_id = public.get_user_organization_id())
      OR
      (
        organization_id IS NULL
        AND public.customer_has_org_connection(customers.id, public.get_user_organization_id())
      )
    )
  )
);

-- get_org_customers RPC
-- 組織が見られる顧客を返す:
--   ① ゲスト顧客（organization_id = p_org_id）
--   ② 予約経由のプラットフォーム顧客
--   ③ 貸切グループ経由のプラットフォーム顧客

CREATE OR REPLACE FUNCTION public.get_org_customers(p_org_id uuid)
RETURNS SETOF public.customers
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT DISTINCT c.*
  FROM customers c
  WHERE
    c.organization_id = p_org_id
    OR EXISTS (
      SELECT 1 FROM reservations r
      WHERE r.customer_id = c.id AND r.organization_id = p_org_id
    )
    OR EXISTS (
      SELECT 1 FROM private_groups pg
      JOIN private_group_members pgm ON pgm.group_id = pg.id
      WHERE pg.organization_id = p_org_id
        AND c.user_id IS NOT NULL
        AND pgm.user_id = c.user_id
    )
  ORDER BY c.created_at DESC
$$;

GRANT EXECUTE ON FUNCTION public.get_org_customers(uuid) TO authenticated;

-- get_org_customers_with_stats RPC
-- 背景: 顧客管理ページ（useCustomerData.ts）が全顧客→全予約→全クーポンをクライアントに
--       DL してから集計しており、顧客数が増えると直列クエリが爆発する（P1改善）。
--       ページング済みの顧客だけに集計 LEFT JOIN をかけるサーバ集計 RPC に差し替える。
--
-- 母集団: customers.organization_id = p_org_id のみ（既存 get_org_customers の
--         予約経由 OR 句・貸切グループ経由 OR 句は含めない＝現行フロントの RLS 直読み
--         と同じ母集団。プラットフォーム顧客(organization_id IS NULL) は対象外）。
-- 検索: name/email/phone の ILIKE 部分一致（ワイルドカード文字 % _ \ をエスケープ）。
-- ソート: created_at DESC 固定。
-- 集計定義は src/pages/CustomerManagement/hooks/useCustomerData.ts:49-116 の逐語移植:
--   reservation_count / total_paid / last_visit / visit_count
--     = reservations WHERE status IN ('confirmed','gm_confirmed','completed')
--       AND organization_id = p_org_id AND customer_id = c.id
--   total_coupons / used_coupons / remaining_coupons
--     = customer_coupons × coupon_campaigns.max_uses_per_customer
--       （status フィルタ無し・organization_id フィルタ無し＝現行どおり。
--        campaign 欠損（LEFT JOIN で NULL）は 0 扱い）
--
-- SECURITY DEFINER: RLS を経由せず全顧客・全予約・全クーポンを横断集計する必要があるため。
-- API (api/customers.ts) 経由専用。PUBLIC/anon/authenticated の EXECUTE 権限は剥がし、
-- service_role のみに許可する。

CREATE OR REPLACE FUNCTION public.get_org_customers_with_stats(
  p_org_id uuid,
  p_search text DEFAULT NULL,
  p_limit int DEFAULT 50,
  p_offset int DEFAULT 0
)
RETURNS TABLE (
  id uuid,
  organization_id uuid,
  user_id uuid,
  name text,
  nickname varchar,
  email text,
  email_verified boolean,
  phone text,
  address text,
  line_id text,
  avatar_url text,
  birth_date date,
  prefecture text,
  preferences text[],
  notification_settings jsonb,
  created_at timestamptz,
  updated_at timestamptz,
  reservation_count bigint,
  total_paid bigint,
  last_visit timestamptz,
  visit_count bigint,
  total_coupons bigint,
  used_coupons bigint,
  remaining_coupons bigint,
  total_count bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH escaped AS (
    SELECT CASE
      WHEN p_search IS NULL OR btrim(p_search) = '' THEN NULL
      ELSE '%' || replace(replace(replace(btrim(p_search), '\', '\\'), '%', '\%'), '_', '\_') || '%'
    END AS pattern
  ),
  base AS (
    SELECT c.*
    FROM public.customers c, escaped e
    WHERE c.organization_id = p_org_id
      AND (
        e.pattern IS NULL
        OR c.name ILIKE e.pattern ESCAPE '\'
        OR c.email ILIKE e.pattern ESCAPE '\'
        OR c.phone ILIKE e.pattern ESCAPE '\'
      )
  ),
  paged AS (
    SELECT b.*, count(*) OVER () AS total_count
    FROM base b
    ORDER BY b.created_at DESC
    LIMIT p_limit OFFSET p_offset
  ),
  reservation_stats AS (
    SELECT
      r.customer_id,
      count(*) AS reservation_count,
      coalesce(sum(r.total_price), 0) AS total_paid,
      max(r.requested_datetime) AS last_visit,
      count(*) FILTER (WHERE r.status = 'completed') AS visit_count
    FROM public.reservations r
    WHERE r.customer_id IN (SELECT id FROM paged)
      AND r.organization_id = p_org_id
      AND r.status IN ('confirmed', 'gm_confirmed', 'completed')
    GROUP BY r.customer_id
  ),
  coupon_stats AS (
    SELECT
      cc.customer_id,
      coalesce(sum(coalesce(camp.max_uses_per_customer, 0)), 0) AS total_coupons,
      coalesce(sum(coalesce(camp.max_uses_per_customer, 0) - coalesce(cc.uses_remaining, 0)), 0) AS used_coupons,
      coalesce(sum(coalesce(cc.uses_remaining, 0)), 0) AS remaining_coupons
    FROM public.customer_coupons cc
    LEFT JOIN public.coupon_campaigns camp ON camp.id = cc.campaign_id
    WHERE cc.customer_id IN (SELECT id FROM paged)
    GROUP BY cc.customer_id
  )
  SELECT
    p.id,
    p.organization_id,
    p.user_id,
    p.name,
    p.nickname,
    p.email,
    p.email_verified,
    p.phone,
    p.address,
    p.line_id,
    p.avatar_url,
    p.birth_date,
    p.prefecture,
    p.preferences,
    p.notification_settings,
    p.created_at,
    p.updated_at,
    coalesce(rs.reservation_count, 0) AS reservation_count,
    coalesce(rs.total_paid, 0) AS total_paid,
    rs.last_visit,
    coalesce(rs.visit_count, 0) AS visit_count,
    coalesce(cs.total_coupons, 0) AS total_coupons,
    coalesce(cs.used_coupons, 0) AS used_coupons,
    coalesce(cs.remaining_coupons, 0) AS remaining_coupons,
    p.total_count
  FROM paged p
  LEFT JOIN reservation_stats rs ON rs.customer_id = p.id
  LEFT JOIN coupon_stats cs ON cs.customer_id = p.id
  ORDER BY p.created_at DESC
$$;

REVOKE ALL ON FUNCTION public.get_org_customers_with_stats(uuid, text, int, int) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_org_customers_with_stats(uuid, text, int, int) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_org_customers_with_stats(uuid, text, int, int) TO service_role;

COMMENT ON FUNCTION public.get_org_customers_with_stats IS
  '顧客管理ページ用: 組織の顧客をページング＋検索し、ページ内顧客のみに予約/クーポン集計を LEFT JOIN して返す（api/customers.ts の action=listWithStats 専用・service_role のみ実行可）';

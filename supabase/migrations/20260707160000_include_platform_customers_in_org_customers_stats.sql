-- get_org_customers_with_stats: プラットフォーム顧客(organization_id IS NULL)を母集団に追加
--
-- 背景 (#329 / #317 再発経路 / #328 指摘):
--   link_current_user_to_customer が会員紐付け時に customers.organization_id を NULL へ
--   正規化するため、母集団を「organization_id = p_org_id」のみに限定していた本 RPC では、
--   会員がマイページを開いて紐付けが起きるたびに、その顧客が顧客管理一覧から消えていた。
--
-- 修正: base CTE の母集団を、既存 get_org_customers(20260519010000) の
--   「予約経由・貸切グループ経由でプラットフォーム顧客を拾う」パターンに合わせて拡張する。
--   ただしマルチテナント境界維持のため OR 分岐は organization_id IS NULL に限定する
--   （= 他組織所属の顧客が当組織一覧に混ざらない。#329 受入条件「他組織にしか接点の
--     ない顧客は表示されない」）。
--
--   ① ゲスト顧客        : c.organization_id = p_org_id
--   ② 予約経由の会員     : c.organization_id IS NULL AND 当組織への予約あり
--   ③ 貸切グループ経由   : c.organization_id IS NULL AND 当組織の貸切グループに参加
--
--   分岐 ① と（② OR ③）は organization_id の値で排他（= p_org_id / IS NULL）のため
--   重複行は発生せず、DISTINCT 不要。total_count(count(*) OVER ())・ソート・ページングも
--   統合後の母集団でそのまま正しく動く。
--
-- 署名・戻り値・集計定義・権限(service_role のみ)は 20260703100000 から変更なし。
-- base CTE の WHERE 句のみ拡張する。

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
    WHERE (
        c.organization_id = p_org_id
        OR (
          c.organization_id IS NULL
          AND (
            EXISTS (
              SELECT 1 FROM public.reservations r
              WHERE r.customer_id = c.id
                AND r.organization_id = p_org_id
            )
            OR EXISTS (
              SELECT 1 FROM public.private_groups pg
              JOIN public.private_group_members pgm ON pgm.group_id = pg.id
              WHERE pg.organization_id = p_org_id
                AND c.user_id IS NOT NULL
                AND pgm.user_id = c.user_id
            )
          )
        )
      )
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
  '顧客管理ページ用: 組織の顧客(ゲスト顧客 + 当組織に予約/貸切接点のあるプラットフォーム顧客)をページング＋検索し、ページ内顧客のみに予約/クーポン集計を LEFT JOIN して返す（api/customers.ts の action=listWithStats 専用・service_role のみ実行可）';

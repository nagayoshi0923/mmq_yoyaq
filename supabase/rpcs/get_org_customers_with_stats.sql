CREATE OR REPLACE FUNCTION public.get_org_customers_with_stats(p_org_id uuid, p_search text DEFAULT NULL::text, p_limit integer DEFAULT 50, p_offset integer DEFAULT 0)
 RETURNS TABLE(id uuid, organization_id uuid, user_id uuid, name text, nickname character varying, email text, email_verified boolean, phone text, address text, line_id text, avatar_url text, birth_date date, prefecture text, preferences text[], notification_settings jsonb, created_at timestamp with time zone, updated_at timestamp with time zone, reservation_count bigint, total_paid bigint, last_visit timestamp with time zone, visit_count bigint, total_coupons bigint, used_coupons bigint, remaining_coupons bigint, total_count bigint)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  coupon_usage_counts AS (
    SELECT cu.customer_coupon_id, count(*) AS used_count
    FROM public.coupon_usages cu
    JOIN public.customer_coupons cc ON cc.id = cu.customer_coupon_id
    JOIN public.reservations r ON r.id = cu.reservation_id
    WHERE cc.customer_id IN (SELECT id FROM paged)
      AND cc.organization_id = p_org_id AND r.organization_id = p_org_id
    GROUP BY cu.customer_coupon_id
  ),
  coupon_stats AS (
    SELECT
      cc.customer_id,
      count(*) AS total_coupons,
      coalesce(sum(uc.used_count), 0)::bigint AS used_coupons,
      coalesce(sum(cc.uses_remaining) FILTER (
        WHERE cc.status = 'active' AND cc.uses_remaining > 0
          AND (cc.expires_at IS NULL OR cc.expires_at >= now())
          AND (NULLIF(cc.rules_snapshot->>'usage_valid_from', '') IS NULL
            OR (cc.rules_snapshot->>'usage_valid_from')::timestamptz <= now())
          AND (NULLIF(cc.rules_snapshot->>'usage_valid_until', '') IS NULL
            OR (cc.rules_snapshot->>'usage_valid_until')::timestamptz >= now())
      ), 0) AS remaining_coupons
    FROM public.customer_coupons cc
    JOIN public.coupon_campaigns camp ON camp.id = cc.campaign_id AND camp.organization_id = p_org_id
    LEFT JOIN coupon_usage_counts uc ON uc.customer_coupon_id = cc.id
    WHERE cc.customer_id IN (SELECT id FROM paged)
      AND cc.organization_id = p_org_id
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
$function$;

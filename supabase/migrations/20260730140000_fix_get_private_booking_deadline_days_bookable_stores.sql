-- =============================================================================
-- get_private_booking_deadline_days の集計対象を予約可能店舗に修正
-- =============================================================================
-- 背景:
-- - 旧実装は reservation_settings のみを集計していたため、設定行が無い店舗
--   （＝実質 14 日運用）が MAX に含まれず、締切が短く出るケースがあった。
--   また、閉店店舗やオフィス（予約不可）の設定値まで拾っていた。
-- - stores を起点に LEFT JOIN し、予約可能店舗（active かつ office 以外）のみを
--   集計する。設定行が無い店舗は 14 日として MAX に含める。
--
-- 正規定義: supabase/rpcs/get_private_booking_deadline_days.sql

CREATE OR REPLACE FUNCTION get_private_booking_deadline_days(
  p_organization_id UUID DEFAULT NULL,
  p_organization_slug TEXT DEFAULT NULL
)
RETURNS INTEGER
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (
      SELECT MAX(COALESCE(rs.private_booking_deadline_days, 14))
      FROM public.stores s
      LEFT JOIN public.reservation_settings rs
        ON rs.store_id = s.id
      WHERE s.status = 'active'
        AND s.ownership_type IS DISTINCT FROM 'office'
        AND CASE
          WHEN p_organization_id IS NOT NULL THEN s.organization_id = p_organization_id
          WHEN p_organization_slug IS NOT NULL THEN s.organization_id = (
            SELECT o.id FROM public.organizations o WHERE o.slug = p_organization_slug
          )
          ELSE TRUE
        END
    ),
    14
  );
$$;

GRANT EXECUTE ON FUNCTION get_private_booking_deadline_days(UUID, TEXT) TO anon, authenticated;

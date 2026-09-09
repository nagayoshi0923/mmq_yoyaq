-- 正規ソース。変更後は新規マイグレにこのファイル全文を貼る。
--
-- 貸切公演の予約受付締切（公演日の何日前まで申込可能か）を返す。
-- 設定は reservation_settings.private_booking_deadline_days（店舗単位）。
-- 公開ページ（anon）からは reservation_settings を直接 SELECT できないため、
-- この RPC 経由で締切日数のみを公開する。
--
-- 集計対象は予約可能な店舗のみ（status = 'active' かつ ownership_type が 'office' 以外）。
-- 設定行が無い店舗は COALESCE(..., 14) で 14 日として MAX に含める。
-- 組織内で店舗ごとに値が異なる場合は MAX（最も厳しい締切）を採用する。
-- 対象店舗が 1 件も無い場合のフォールバックは 14 日。

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

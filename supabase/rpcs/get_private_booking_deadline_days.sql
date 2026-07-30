-- 正規ソース。変更後は新規マイグレにこのファイル全文を貼る。
--
-- 貸切公演の予約受付締切（公演日の何日前まで申込可能か）を返す。
-- 設定は reservation_settings.private_booking_deadline_days（店舗単位）。
-- 公開ページ（anon）からは reservation_settings を直接 SELECT できないため、
-- この RPC 経由で締切日数のみを公開する。
--
-- 組織内で店舗ごとに異なる値が設定されている場合は MAX（最も厳しい締切）を採用。
-- 設定行が存在しない場合のフォールバックは 14 日。

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
      SELECT MAX(rs.private_booking_deadline_days)
      FROM public.reservation_settings rs
      WHERE rs.private_booking_deadline_days IS NOT NULL
        AND CASE
          WHEN p_organization_id IS NOT NULL THEN rs.organization_id = p_organization_id
          WHEN p_organization_slug IS NOT NULL THEN rs.organization_id = (
            SELECT o.id FROM public.organizations o WHERE o.slug = p_organization_slug
          )
          ELSE TRUE
        END
    ),
    14
  );
$$;

GRANT EXECUTE ON FUNCTION get_private_booking_deadline_days(UUID, TEXT) TO anon, authenticated;

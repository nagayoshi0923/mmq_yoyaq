-- =============================================================================
-- 貸切予約の受付締切（日前）を設定値として全フローで参照できるようにする
-- =============================================================================
-- 背景:
-- - reservation_settings.private_booking_deadline_days は存在していたが、
--   SELECT ポリシーが admin 限定のため公開ページ（anon）からは読めず、
--   フロントは 14 日をハードコードして判定していた。
-- - 既存行の値 7 は列デフォルト由来で、実際の締切判定には使われていない。
--   実効挙動（14日）に合わせて補正し、以後は設定値を正とする。

-- 1) organization_id が未設定の行を stores から補完
UPDATE public.reservation_settings rs
SET organization_id = s.organization_id
FROM public.stores s
WHERE rs.store_id = s.id
  AND rs.organization_id IS NULL;

-- 2) 列デフォルト由来の 7 を、これまでの実効挙動である 14 に補正
UPDATE public.reservation_settings
SET private_booking_deadline_days = 14
WHERE private_booking_deadline_days = 7;

ALTER TABLE public.reservation_settings
  ALTER COLUMN private_booking_deadline_days SET DEFAULT 14;

-- 3) 公開ページ（anon）から締切日数を取得する RPC
--    正規定義: supabase/rpcs/get_private_booking_deadline_days.sql
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

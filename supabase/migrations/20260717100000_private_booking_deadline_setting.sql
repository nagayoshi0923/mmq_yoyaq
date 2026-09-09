-- =============================================================================
-- 貸切予約の受付締切（日前）を設定値として全フローで参照できるようにする
-- =============================================================================
-- 背景:
-- - reservation_settings.private_booking_deadline_days は
--   SELECT ポリシーが admin 限定のため公開ページ（anon）からは読めず、
--   フロントは 14 日をハードコードして判定していた。
-- - 以後はこの設定値を正とし、列デフォルトも実効挙動の 14 に揃える。
--   既存行の値は明示設定の可能性があるため書き換えない。

-- 1) 列が存在しない環境（fresh reset 等）に備えて追加
ALTER TABLE public.reservation_settings
  ADD COLUMN IF NOT EXISTS private_booking_deadline_days INTEGER DEFAULT 14;

-- 2) organization_id が未設定の行を stores から補完
UPDATE public.reservation_settings rs
SET organization_id = s.organization_id
FROM public.stores s
WHERE rs.store_id = s.id
  AND rs.organization_id IS NULL;

ALTER TABLE public.reservation_settings
  ALTER COLUMN private_booking_deadline_days SET DEFAULT 14;

-- 3) 公開ページ（anon）から締切日数を取得する RPC
--    正規定義: supabase/rpcs/get_private_booking_deadline_days.sql
--    予約可能店舗（active かつ office 以外）のみを集計し、設定行が無い店舗は 14 とみなす。
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

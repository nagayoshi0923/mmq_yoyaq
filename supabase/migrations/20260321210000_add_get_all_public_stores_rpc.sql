-- 全組織の公開店舗を取得するRPC（MMQシナリオ検索用）
-- 機密情報を除外し、フィルター表示に必要な情報のみ返す

DROP FUNCTION IF EXISTS public.get_all_public_stores();

CREATE OR REPLACE FUNCTION public.get_all_public_stores()
RETURNS TABLE (
  id UUID,
  name TEXT,
  short_name TEXT,
  ownership_type TEXT,
  region TEXT,
  address TEXT,
  display_order INTEGER,
  organization_id UUID,
  organization_name TEXT
)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT 
    s.id,
    s.name::TEXT,
    s.short_name::TEXT,
    s.ownership_type::TEXT,
    s.region::TEXT,
    s.address::TEXT,
    s.display_order,
    s.organization_id,
    o.name::TEXT AS organization_name
  FROM public.stores s
  LEFT JOIN public.organizations o ON s.organization_id = o.id
  ORDER BY s.display_order NULLS LAST, s.name;
$$;

-- 匿名ユーザーも実行可能（公開情報のみ返すため安全）
GRANT EXECUTE ON FUNCTION public.get_all_public_stores() TO anon;
GRANT EXECUTE ON FUNCTION public.get_all_public_stores() TO authenticated;

COMMENT ON FUNCTION public.get_all_public_stores() IS 
  'MMQシナリオ検索用: 全組織の店舗の公開情報を返す（家賃・人件費等の機密情報は除外）';

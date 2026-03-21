-- 全組織の公開カテゴリを取得するRPC（MMQシナリオ検索用）
-- organization_categories テーブルの RLS を迂回し、匿名ユーザーにも返す

DROP FUNCTION IF EXISTS public.get_all_public_categories();

CREATE OR REPLACE FUNCTION public.get_all_public_categories()
RETURNS TABLE (
  id UUID,
  name TEXT,
  sort_order INTEGER
)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT DISTINCT ON (oc.name)
    oc.id,
    oc.name::TEXT,
    oc.sort_order
  FROM public.organization_categories oc
  ORDER BY oc.name, oc.sort_order;
$$;

GRANT EXECUTE ON FUNCTION public.get_all_public_categories() TO anon;
GRANT EXECUTE ON FUNCTION public.get_all_public_categories() TO authenticated;

COMMENT ON FUNCTION public.get_all_public_categories() IS 
  'MMQシナリオ検索用: 全組織のカテゴリ名を重複なしで返す（公開情報のみ）';

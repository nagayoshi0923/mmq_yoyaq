-- 公開ブログ記事を「組織スラッグ + 記事スラッグ」で取得する RPC
-- 背景: フロントが先に organizations を SELECT して id を解決する方式だと、
--       organizations の RLS（is_active など）で行が見えず、公開記事でも 404 になることがある。
-- 方針: 公開中かつ slug 一致のみ返す SECURITY DEFINER で、意図した公開読み取りのみ許可する。

CREATE OR REPLACE FUNCTION public.get_public_blog_post(
  p_org_slug text,
  p_article_slug text
)
RETURNS SETOF public.blog_posts
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT bp.*
  FROM public.blog_posts bp
  INNER JOIN public.organizations o ON o.id = bp.organization_id
  WHERE o.slug = p_org_slug
    AND bp.slug = p_article_slug
    AND bp.is_published = true
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.get_public_blog_post(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_blog_post(text, text) TO anon, authenticated;

COMMENT ON FUNCTION public.get_public_blog_post IS
  '公開中のブログ記事を組織スラッグと記事スラッグで取得（organizations RLS に依存しない）';

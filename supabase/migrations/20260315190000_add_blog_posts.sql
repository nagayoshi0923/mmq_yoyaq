-- =============================================================================
-- 20260315: ブログ（お知らせ）機能
-- =============================================================================
--
-- 目的:
-- - 店舗からのお知らせ・記事を掲載できる機能
-- - トップページやマイページで最新情報を表示
--
-- =============================================================================

-- =====================
-- 1. blog_posts テーブル
-- =====================
CREATE TABLE IF NOT EXISTS public.blog_posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  slug TEXT NOT NULL,
  excerpt TEXT,
  content TEXT NOT NULL,
  cover_image_url TEXT,
  is_published BOOLEAN NOT NULL DEFAULT false,
  published_at TIMESTAMPTZ,
  author_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  view_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, slug)
);

CREATE INDEX IF NOT EXISTS idx_blog_posts_org ON public.blog_posts(organization_id);
CREATE INDEX IF NOT EXISTS idx_blog_posts_published ON public.blog_posts(is_published, published_at DESC) WHERE is_published = true;
CREATE INDEX IF NOT EXISTS idx_blog_posts_slug ON public.blog_posts(slug);

COMMENT ON TABLE public.blog_posts IS 'ブログ・お知らせ記事';
COMMENT ON COLUMN public.blog_posts.slug IS 'URL用スラッグ（組織内で一意）';
COMMENT ON COLUMN public.blog_posts.excerpt IS '記事の抜粋（一覧表示用）';
COMMENT ON COLUMN public.blog_posts.content IS '記事本文（Markdown or HTML）';

-- =====================
-- 2. RLS ポリシー
-- =====================
ALTER TABLE public.blog_posts ENABLE ROW LEVEL SECURITY;

-- 公開記事は誰でも読める
DROP POLICY IF EXISTS "blog_posts_select_published" ON public.blog_posts;
CREATE POLICY "blog_posts_select_published" ON public.blog_posts
  FOR SELECT
  USING (
    is_published = true
    OR organization_id = get_user_organization_id()
  );

-- 管理者のみ作成・更新・削除可能
DROP POLICY IF EXISTS "blog_posts_insert_admin" ON public.blog_posts;
CREATE POLICY "blog_posts_insert_admin" ON public.blog_posts
  FOR INSERT
  WITH CHECK (
    organization_id = get_user_organization_id()
    AND is_org_admin()
  );

DROP POLICY IF EXISTS "blog_posts_update_admin" ON public.blog_posts;
CREATE POLICY "blog_posts_update_admin" ON public.blog_posts
  FOR UPDATE
  USING (
    organization_id = get_user_organization_id()
    AND is_org_admin()
  );

DROP POLICY IF EXISTS "blog_posts_delete_admin" ON public.blog_posts;
CREATE POLICY "blog_posts_delete_admin" ON public.blog_posts
  FOR DELETE
  USING (
    organization_id = get_user_organization_id()
    AND is_org_admin()
  );

-- =====================
-- 3. updated_at トリガー
-- =====================
DROP TRIGGER IF EXISTS trg_blog_posts_updated_at ON public.blog_posts;
CREATE TRIGGER trg_blog_posts_updated_at
  BEFORE UPDATE ON public.blog_posts
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

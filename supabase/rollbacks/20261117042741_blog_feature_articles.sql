-- 20261117042741_blog_feature_articles の巻き戻し: 公開用RPC3つと blog_posts の追加列を消す。
-- 追加列（記事の種類・バナー設定・表示終了日時）の値は消える。記事の本文・題名などは残る。
DROP FUNCTION IF EXISTS public.get_public_feature_banners(text);
DROP FUNCTION IF EXISTS public.get_public_blog_posts(text, text);
DROP FUNCTION IF EXISTS public.get_public_feature_scenarios(uuid, uuid[], text[]);
DROP INDEX IF EXISTS public.idx_blog_posts_banner;
ALTER TABLE public.blog_posts DROP CONSTRAINT IF EXISTS blog_posts_post_type_check;
ALTER TABLE public.blog_posts
  DROP COLUMN IF EXISTS post_type,
  DROP COLUMN IF EXISTS show_in_top_banner,
  DROP COLUMN IF EXISTS banner_order,
  DROP COLUMN IF EXISTS display_until;

-- 特集記事（キャンペーン・キャラ特集・カテゴリ特集）をブログ記事として書けるようにする（QW-20261116-001、2026-11-17 社長指示「ブログ機能で記事を作るイメージ」）
-- 1. blog_posts に記事の種類・TOPバナーに出すか・並び順・表示終了日時を足す（既存行は「お知らせ」・バナーなしのまま）
-- 2. お客様画面（未ログイン含む）用に、最小の列だけ返す SECURITY DEFINER RPC を3つ足す
--    blog_posts は anon に SELECT 権限が無いため（2026-11-16 本番で確認）

ALTER TABLE public.blog_posts
  ADD COLUMN IF NOT EXISTS post_type text NOT NULL DEFAULT 'news',
  ADD COLUMN IF NOT EXISTS show_in_top_banner boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS banner_order integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS display_until timestamptz;

ALTER TABLE public.blog_posts DROP CONSTRAINT IF EXISTS blog_posts_post_type_check;
ALTER TABLE public.blog_posts ADD CONSTRAINT blog_posts_post_type_check
  CHECK (post_type IN ('news', 'campaign', 'character_feature', 'category_feature'));

COMMENT ON COLUMN public.blog_posts.post_type IS '記事の種類: news=お知らせ / campaign=キャンペーン / character_feature=キャラ特集 / category_feature=カテゴリ特集';
COMMENT ON COLUMN public.blog_posts.show_in_top_banner IS 'トップの「キャンペーン・特集」バナーに出す';
COMMENT ON COLUMN public.blog_posts.banner_order IS 'バナーの並び順（小さいほど先）';
COMMENT ON COLUMN public.blog_posts.display_until IS 'この日時を過ぎたらバナーと記事一覧から外す（NULL=ずっと）。記事ページ自体は開ける';

CREATE INDEX IF NOT EXISTS idx_blog_posts_banner
  ON public.blog_posts (banner_order, published_at DESC)
  WHERE is_published = true AND show_in_top_banner = true;

-- トップのバナー（p_org_slug が NULL なら全組織＝MMQトップ、指定ならその組織＝組織トップ）
CREATE OR REPLACE FUNCTION public.get_public_feature_banners(p_org_slug text DEFAULT NULL)
RETURNS TABLE (
  id uuid, title text, slug text, excerpt text, cover_image_url text, post_type text,
  banner_order integer, published_at timestamptz, organization_slug text, organization_name text
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT bp.id, bp.title, bp.slug, bp.excerpt, bp.cover_image_url, bp.post_type,
         bp.banner_order, bp.published_at, o.slug, o.name
  FROM public.blog_posts bp
  JOIN public.organizations o ON o.id = bp.organization_id
  WHERE bp.is_published = true
    AND bp.show_in_top_banner = true
    AND (bp.published_at IS NULL OR bp.published_at <= now())
    AND (bp.display_until IS NULL OR bp.display_until > now())
    AND coalesce(o.is_active, true) = true
    AND (p_org_slug IS NULL OR o.slug = p_org_slug)
  ORDER BY bp.banner_order ASC, bp.published_at DESC NULLS LAST
  LIMIT 20;
$$;

-- 特集・お知らせの一覧（p_post_type が NULL ならすべての種類）
CREATE OR REPLACE FUNCTION public.get_public_blog_posts(p_org_slug text DEFAULT NULL, p_post_type text DEFAULT NULL)
RETURNS TABLE (
  id uuid, title text, slug text, excerpt text, cover_image_url text, post_type text,
  published_at timestamptz, organization_slug text, organization_name text
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT bp.id, bp.title, bp.slug, bp.excerpt, bp.cover_image_url, bp.post_type,
         bp.published_at, o.slug, o.name
  FROM public.blog_posts bp
  JOIN public.organizations o ON o.id = bp.organization_id
  WHERE bp.is_published = true
    AND (bp.published_at IS NULL OR bp.published_at <= now())
    AND (bp.display_until IS NULL OR bp.display_until > now())
    AND coalesce(o.is_active, true) = true
    AND (p_org_slug IS NULL OR o.slug = p_org_slug)
    AND (p_post_type IS NULL OR bp.post_type = p_post_type)
  ORDER BY bp.published_at DESC NULLS LAST
  LIMIT 100;
$$;

-- 記事に差し込む作品（作品カード・タグで自動の一覧・キャラ紹介）。公開中の作品の公開情報と、次の公演2件だけ返す
-- p_scenario_ids と p_tags がどちらも NULL なら、その組織の公開中の作品すべて（管理画面の作品選び用）
CREATE OR REPLACE FUNCTION public.get_public_feature_scenarios(
  p_organization_id uuid,
  p_scenario_ids uuid[] DEFAULT NULL,
  p_tags text[] DEFAULT NULL
)
RETURNS TABLE (
  scenario_master_id uuid, slug text, title text, author text, key_visual_url text,
  player_count_min integer, player_count_max integer, duration integer, genre text[],
  release_date date, organization_slug text, organization_name text, characters jsonb, next_events jsonb,
  accepts_private_booking boolean
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT os.scenario_master_id,
         os.slug,
         coalesce(os.override_title, sm.title),
         coalesce(os.override_author, sm.author),
         coalesce(os.custom_key_visual_url, sm.key_visual_url),
         coalesce(os.override_player_count_min, sm.player_count_min),
         coalesce(os.override_player_count_max, sm.player_count_max),
         coalesce(os.duration, sm.official_duration),
         coalesce(os.override_genre, sm.genre),
         sm.release_date,
         o.slug,
         o.name,
         coalesce((
           SELECT jsonb_agg(jsonb_build_object(
                    'id', c->>'id', 'name', c->>'name', 'age', c->>'age', 'gender', c->>'gender',
                    'occupation', c->>'occupation', 'description', c->>'description',
                    'image_url', c->>'image_url', 'image_position', c->>'image_position',
                    'background_color', c->>'background_color', 'is_npc', coalesce((c->>'is_npc')::boolean, false)))
           FROM jsonb_array_elements(CASE WHEN jsonb_typeof(os.characters) = 'array' THEN os.characters ELSE '[]'::jsonb END) c
         ), '[]'::jsonb),
         coalesce((
           SELECT jsonb_agg(ev ORDER BY ev->>'date', ev->>'start_time')
           FROM (
             SELECT jsonb_build_object(
                      'id', se.id, 'date', se.date, 'start_time', se.start_time,
                      -- 店舗名はお客様向けの決め方（src/lib/publicStoreName.ts の storeDisplayName）で画面側が整える
                      'store_name', st.name, 'store_short_name', st.short_name, 'store_public_name', st.public_name,
                      'store_is_temporary', coalesce(st.is_temporary, false),
                      'store_venue_name', CASE WHEN jsonb_typeof(st.temporary_venue_names) = 'object' THEN st.temporary_venue_names ->> se.date::text END,
                      'venue', se.venue,
                      'available_seats', greatest(coalesce(se.max_participants, se.capacity, os.override_player_count_max, sm.player_count_max, 8) - coalesce(se.current_participants, 0), 0)) ev
             FROM public.schedule_events se
             LEFT JOIN public.stores st ON st.id = se.store_id
             WHERE se.organization_id = os.organization_id
               -- 作品詳細（useScenarioDetail の fetchScheduleEventsMergedForScenario）と同じ 3 経路で紐づける
               AND (se.scenario_master_id = os.scenario_master_id
                    OR se.organization_scenario_id = os.id
                    OR se.scenario = coalesce(os.override_title, sm.title))
               AND se.category IN ('open', 'offsite')
               AND coalesce(se.is_cancelled, false) = false
               AND se.published = true
               AND coalesce(se.is_private_booking, false) = false
               AND coalesce(se.is_tentative, false) = false
               AND coalesce(se.is_reservation_enabled, false) = true
               AND se.date >= (now() AT TIME ZONE 'Asia/Tokyo')::date
               -- 始まった公演は出さない（日本時間）
               AND (se.date + coalesce(se.start_time, '23:59'::time)) > (now() AT TIME ZONE 'Asia/Tokyo')
             ORDER BY se.date, se.start_time
             LIMIT 2
           ) x
         ), '[]'::jsonb),
         -- 貸切の受付（OFF・出張限定は不可。src/lib/privateBookingAcceptance.ts と同じ判定）
         coalesce(os.accepts_private_booking, true) AND coalesce(os.scenario_kind, 'regular') <> 'offsite_only'
  FROM public.organization_scenarios os
  JOIN public.scenario_masters sm ON sm.id = os.scenario_master_id
  JOIN public.organizations o ON o.id = os.organization_id
  WHERE os.organization_id = p_organization_id
    AND os.org_status = 'available'
    AND coalesce(os.web_published, true) = true
    AND (p_scenario_ids IS NULL OR os.scenario_master_id = ANY (p_scenario_ids))
    AND (p_tags IS NULL OR coalesce(os.override_genre, sm.genre) && p_tags)
  ORDER BY coalesce(os.override_title, sm.title)
  LIMIT 400;
$$;

REVOKE ALL ON FUNCTION public.get_public_feature_banners(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_public_blog_posts(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_public_feature_scenarios(uuid, uuid[], text[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_feature_banners(text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_public_blog_posts(text, text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_public_feature_scenarios(uuid, uuid[], text[]) TO anon, authenticated, service_role;

COMMENT ON FUNCTION public.get_public_feature_banners(text) IS 'トップの「キャンペーン・特集」バナー（公開中・期間内・バナーに出す記事のみ、最小列）';
COMMENT ON FUNCTION public.get_public_blog_posts(text, text) IS '特集・お知らせ一覧（公開中・期間内の記事のみ、最小列）';
COMMENT ON FUNCTION public.get_public_feature_scenarios(uuid, uuid[], text[]) IS '特集記事に差し込む公開中の作品（公開情報・キャラ・次の公演2件）';

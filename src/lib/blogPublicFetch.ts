import { supabase } from '@/lib/supabase'
import type { RpcGetPublicBlogPostParams } from '@/lib/rpcTypes'
import { getOrganizationBySlug } from '@/lib/organization'
import type { BlogPost, BlogPostType, FeatureScenario, PublicBlogPostSummary } from '@/types'

/** `blog_posts` の BlogPost 型に対応する SELECT 列（* 回避用・他画面からも利用可） */
export const BLOG_POST_SELECT_COLUMNS =
  'id, organization_id, title, slug, excerpt, content, cover_image_url, is_published, published_at, author_id, view_count, created_at, updated_at, post_type, show_in_top_banner, banner_order, display_until'

export function normalizeArticleSlug(raw: string): string {
  try {
    return decodeURIComponent(raw)
  } catch {
    return raw
  }
}

type JoinedRow = BlogPost & { organizations: { slug: string } | { slug: string }[] }

function blogPostFromJoinedRow(row: JoinedRow): BlogPost {
  const { organizations: _org, ...post } = row
  return post
}

/**
 * 公開中のブログ記事を取得する。
 * - `organizationSlug` なし: `/blog/:slug`（スラッグは組織横断でユニークでない場合は先頭一致に注意）
 * - あり: `/{org}/blog/:slug` 用。organizations → blog_posts、結合、RPC の順で試す。
 */
export async function fetchPublishedBlogPost(params: {
  articleSlug: string
  organizationSlug?: string | null
}): Promise<BlogPost | null> {
  const { articleSlug, organizationSlug } = params

  if (!organizationSlug) {
    const { data, error } = await supabase
      .from('blog_posts')
      .select(BLOG_POST_SELECT_COLUMNS)
      .eq('slug', articleSlug)
      .eq('is_published', true)
      .maybeSingle()
    if (error) throw error
    return data as BlogPost | null
  }

  const orgResolved = await getOrganizationBySlug(organizationSlug.trim())
  const orgSlugForRpc = orgResolved?.slug ?? organizationSlug.trim()

  if (orgResolved?.id) {
    const { data: row, error: postError } = await supabase
      .from('blog_posts')
      .select(BLOG_POST_SELECT_COLUMNS)
      .eq('organization_id', orgResolved.id)
      .eq('slug', articleSlug)
      .eq('is_published', true)
      .maybeSingle()
    if (!postError && row) return row as BlogPost
  }

  const { data: joined, error: joinError } = await supabase
    .from('blog_posts')
    .select(`${BLOG_POST_SELECT_COLUMNS}, organizations!inner(slug)`)
    .eq('slug', articleSlug)
    .eq('is_published', true)
    .eq('organizations.slug', orgSlugForRpc)
    .maybeSingle()

  if (!joinError && joined) {
    return blogPostFromJoinedRow(joined as unknown as JoinedRow)
  }

  const blogParams: RpcGetPublicBlogPostParams = {
    p_org_slug: orgSlugForRpc,
    p_article_slug: articleSlug,
  }
  const { data: rpcRows, error: rpcError } = await supabase.rpc('get_public_blog_post', blogParams)

  if (!rpcError) {
    const row = Array.isArray(rpcRows) ? rpcRows[0] : null
    if (row) return row as BlogPost
  }

  return null
}

export async function incrementBlogViewCount(postId: string, currentCount: number): Promise<void> {
  await supabase.from('blog_posts').update({ view_count: (currentCount || 0) + 1 }).eq('id', postId)
}

/** トップの「キャンペーン・特集」バナー（organizationSlug なしは全組織＝MMQトップ） */
export async function fetchFeatureBanners(organizationSlug?: string | null): Promise<PublicBlogPostSummary[]> {
  const { data, error } = await supabase.rpc('get_public_feature_banners', { p_org_slug: organizationSlug ?? null })
  if (error) throw error
  return (data ?? []) as PublicBlogPostSummary[]
}

/** 特集・お知らせの一覧（公開中・期間内） */
export async function fetchPublicBlogPosts(params: { organizationSlug?: string | null; postType?: BlogPostType | null } = {}): Promise<PublicBlogPostSummary[]> {
  const { data, error } = await supabase.rpc('get_public_blog_posts', {
    p_org_slug: params.organizationSlug ?? null,
    p_post_type: params.postType ?? null,
  })
  if (error) throw error
  return (data ?? []) as PublicBlogPostSummary[]
}

/**
 * 記事に差し込む作品（公開中の作品の公開情報・キャラ・次の公演2件）。
 * scenarioIds と tags がどちらも空なら、その組織の公開中の作品すべて（管理画面の作品選び用）。
 * scenarioIds と tags の両方を渡したときは「どちらかに当たる作品」を返す（2回読んでまとめる）。
 */
export async function fetchFeatureScenarios(params: {
  organizationId: string
  scenarioIds?: readonly string[]
  tags?: readonly string[]
}): Promise<FeatureScenario[]> {
  const ids = params.scenarioIds ?? []
  const tags = params.tags ?? []
  const call = async (p_scenario_ids: string[] | null, p_tags: string[] | null) => {
    const { data, error } = await supabase.rpc('get_public_feature_scenarios', {
      p_organization_id: params.organizationId,
      p_scenario_ids,
      p_tags,
    })
    if (error) throw error
    return (data ?? []) as FeatureScenario[]
  }
  if (ids.length === 0 && tags.length === 0) return call(null, null)
  const lists = await Promise.all([
    ids.length > 0 ? call([...ids], null) : Promise.resolve([]),
    tags.length > 0 ? call(null, [...tags]) : Promise.resolve([]),
  ])
  const byId = new Map<string, FeatureScenario>()
  for (const s of lists.flat()) byId.set(s.scenario_master_id, s)
  return [...byId.values()]
}

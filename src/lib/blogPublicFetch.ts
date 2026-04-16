import { supabase } from '@/lib/supabase'
import type { RpcGetPublicBlogPostParams } from '@/lib/rpcTypes'
import { getOrganizationBySlug } from '@/lib/organization'
import type { BlogPost } from '@/types'

/** `blog_posts` の BlogPost 型に対応する SELECT 列（* 回避用・他画面からも利用可） */
export const BLOG_POST_SELECT_COLUMNS =
  'id, organization_id, title, slug, excerpt, content, cover_image_url, is_published, published_at, author_id, view_count, created_at, updated_at'

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

/**
 * 特集・お知らせの一覧（キャンペーン／キャラ特集／カテゴリ特集／お知らせで切り替え）
 * @path /features（組織トップから来たときは /features?org={orgSlug}）
 * QW-20261116-001（見本: Figma「特集・キャンペーン」の 特集3 一覧）。
 */
import { Link, useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Loader2 } from 'lucide-react'
import { Header } from '@/components/layout/Header'
import { Footer } from '@/components/layout/Footer'
import { usePageMeta } from '@/hooks/usePageMeta'
import { fetchPublicBlogPosts } from '@/lib/blogPublicFetch'
import { getOptimizedImageUrl } from '@/utils/imageUtils'
import { formatJstDateJa } from '@/utils/jstDate'
import { BLOG_POST_TYPE_LABELS, BLOG_POST_TYPES, type BlogPostType, type PublicBlogPostSummary } from '@/types'
import { cn } from '@/lib/utils'
import { BLOG_LIST_PATH } from './paths'

const TYPE_BG: Record<BlogPostType, string> = {
  campaign: '#8A1C1C',
  category_feature: '#1F2A44',
  character_feature: '#2E4A5A',
  news: '#3B3B3B',
}

function isPostType(v: string | null): v is BlogPostType {
  return !!v && (BLOG_POST_TYPES as string[]).includes(v)
}

function PostCard({ post, showOrganization }: { post: PublicBlogPostSummary; showOrganization: boolean }) {
  const img = post.cover_image_url ? (getOptimizedImageUrl(post.cover_image_url, { width: 720, format: 'webp', quality: 75 }) || post.cover_image_url) : null
  const bg = TYPE_BG[post.post_type] ?? TYPE_BG.news
  return (
    <Link to={`/${post.organization_slug}/blog/${encodeURIComponent(post.slug)}`} className="group block border border-border bg-white">
      <div className="relative aspect-[2/1] w-full overflow-hidden" style={{ backgroundColor: bg }}>
        {img && <img src={img} alt="" loading="lazy" className="h-full w-full object-cover" />}
        <span className="absolute left-2 top-2 bg-white px-2 py-0.5 text-xs font-bold" style={{ color: bg }}>
          {BLOG_POST_TYPE_LABELS[post.post_type] ?? 'お知らせ'}
        </span>
      </div>
      <div className="space-y-1 p-3">
        <p className="line-clamp-2 font-bold group-hover:underline">{post.title}</p>
        {post.excerpt && <p className="line-clamp-2 text-sm text-muted-foreground">{post.excerpt}</p>}
        <p className="text-xs text-muted-foreground">
          {post.published_at ? formatJstDateJa(post.published_at) : ''}
          {showOrganization ? `　${post.organization_name}` : ''}
        </p>
      </div>
    </Link>
  )
}

export function BlogList() {
  const [params, setParams] = useSearchParams()
  const org = params.get('org')
  const typeParam = params.get('type')
  const type = isPostType(typeParam) ? typeParam : null

  usePageMeta({
    title: 'キャンペーン・特集 | MMQ',
    description: 'MMQ のキャンペーン、キャラ特集、カテゴリ特集、お知らせの一覧です。',
    canonicalPath: BLOG_LIST_PATH,
  })

  const { data, isLoading, isError } = useQuery({
    queryKey: ['public-blog-posts', org ?? '__all__', type ?? '__all__'],
    queryFn: () => fetchPublicBlogPosts({ organizationSlug: org, postType: type }),
    staleTime: 5 * 60_000,
  })

  const setType = (t: BlogPostType | null) => {
    const next = new URLSearchParams(params)
    if (t) next.set('type', t)
    else next.delete('type')
    setParams(next, { replace: true })
  }

  const chips: Array<{ value: BlogPostType | null; label: string }> = [
    { value: null, label: 'すべて' },
    ...(['campaign', 'character_feature', 'category_feature', 'news'] as BlogPostType[]).map((v) => ({ value: v, label: BLOG_POST_TYPE_LABELS[v] })),
  ]

  return (
    <div className="booking-shell min-h-screen bg-muted/40">
      <Header />
      <main className="mx-auto max-w-4xl space-y-4 px-3.5 py-4 sm:px-4 md:py-6">
        <p className="text-xs text-muted-foreground">
          <Link to={org ? `/${org}` : '/'} className="hover:underline">{org ? 'トップ' : 'MMQ'}</Link> ＞ 特集
        </p>
        <h1 className="text-xl font-bold sm:text-2xl">キャンペーン・特集</h1>
        <div className="flex flex-wrap gap-2">
          {chips.map((c) => (
            <button
              key={c.label}
              type="button"
              onClick={() => setType(c.value)}
              className={cn(
                'rounded-full border px-3 py-1 text-xs font-bold',
                c.value === type ? 'border-primary bg-primary text-white' : 'border-input bg-white',
              )}
            >
              {c.label}
            </button>
          ))}
        </div>

        {isLoading ? (
          <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
        ) : isError ? (
          <p className="py-10 text-center text-sm text-muted-foreground">記事を読み込めませんでした。時間をおいて開き直してください。</p>
        ) : !data || data.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">いま公開中の記事はありません。</p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {data.map((post) => <PostCard key={post.id} post={post} showOrganization={!org} />)}
          </div>
        )}
      </main>
      <Footer />
    </div>
  )
}

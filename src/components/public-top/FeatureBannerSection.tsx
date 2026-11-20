/**
 * トップの「キャンペーン・特集」バナー枠（ヒーローのすぐ下）。QW-20261116-001。
 * 管理画面のブログで「TOPのバナーに出す」にした公開中・期間内の記事を、並び順で出す。
 * MMQトップは全組織、組織トップはその組織の記事だけ。1件も無ければ枠ごと出さない。
 */
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { fetchFeatureBanners } from '@/lib/blogPublicFetch'
import { getOptimizedImageUrl } from '@/utils/imageUtils'
import { BLOG_POST_TYPE_LABELS, type PublicBlogPostSummary } from '@/types'
import { TopSection } from '@/components/public-top/TopSection'
import { blogListPath } from '@/pages/BlogList/paths'

/** 画像が無い記事の地の色（種類ごと） */
const FALLBACK_BG: Record<string, string> = {
  campaign: '#8A1C1C',
  category_feature: '#1F2A44',
  character_feature: '#2E4A5A',
  news: '#3B3B3B',
}

function BannerCard({ post, showOrganization }: { post: PublicBlogPostSummary; showOrganization: boolean }) {
  const img = post.cover_image_url ? (getOptimizedImageUrl(post.cover_image_url, { width: 640, format: 'webp', quality: 75 }) || post.cover_image_url) : null
  return (
    <Link
      to={`/${post.organization_slug}/blog/${encodeURIComponent(post.slug)}`}
      className="relative flex h-[150px] w-[300px] flex-col justify-between overflow-hidden rounded-md p-3 text-white sm:h-[180px] sm:w-[360px]"
      style={{ backgroundColor: FALLBACK_BG[post.post_type] ?? FALLBACK_BG.news }}
    >
      {img && <img src={img} alt="" loading="lazy" className="absolute inset-0 h-full w-full object-cover" />}
      {img && <span className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" aria-hidden />}
      <span className="relative self-start bg-white px-2 py-0.5 text-xs font-bold" style={{ color: FALLBACK_BG[post.post_type] ?? FALLBACK_BG.news }}>
        {BLOG_POST_TYPE_LABELS[post.post_type] ?? '特集'}
      </span>
      <span className="relative space-y-0.5">
        <span className="line-clamp-2 block font-bold">{post.title}</span>
        {post.excerpt && <span className="line-clamp-1 block text-xs text-white/85">{post.excerpt}</span>}
        {showOrganization && <span className="block text-xs text-white/70">{post.organization_name}</span>}
      </span>
    </Link>
  )
}

export function FeatureBannerSection({ organizationSlug }: { organizationSlug?: string | null }) {
  const { data } = useQuery({
    queryKey: ['feature-banners', organizationSlug ?? '__platform__'],
    queryFn: () => fetchFeatureBanners(organizationSlug),
    staleTime: 5 * 60_000,
    // 管理画面でバナーを出し入れしたらトップに戻ったときに反映する（アプリ全体は refetchOnMount: false）
    refetchOnMount: 'always',
  })
  if (!data || data.length === 0) return null
  return (
    <TopSection
      id="features"
      title="キャンペーン・特集"
      aside={<Link to={blogListPath(organizationSlug)} className="font-medium text-booking-primary hover:underline">すべて見る ›</Link>}
    >
      <ul className="-mx-1 flex snap-x gap-2 overflow-x-auto px-1 pb-1 scroll-row" aria-label="キャンペーン・特集">
        {data.map((post) => (
          <li key={post.id} className="shrink-0 snap-start">
            <BannerCard post={post} showOrganization={!organizationSlug} />
          </li>
        ))}
      </ul>
    </TopSection>
  )
}

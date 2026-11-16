/**
 * ブログ記事詳細ページ
 * @path /blog/:slug または /{orgSlug}/blog/:slug
 */
import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Header } from '@/components/layout/Header'
import { Footer } from '@/components/layout/Footer'
import { Button } from '@/components/ui/button'
import {
  fetchPublishedBlogPost,
  incrementBlogViewCount,
  normalizeArticleSlug,
} from '@/lib/blogPublicFetch'
import { logger } from '@/utils/logger'
import { formatJstDateJa } from '@/utils/jstDate'
import { ArrowLeft, Calendar, Loader2 } from 'lucide-react'
import { MYPAGE_THEME as THEME } from '@/lib/theme'
import { BLOG_POST_TYPE_LABELS, type BlogPost } from '@/types'
import { ArticleBody } from '@/components/blog/ArticleBody'
import { usePageMeta } from '@/hooks/usePageMeta'
import { blogPageTitle } from '@/lib/seo'

interface BlogDetailPageProps {
  slug: string
  /** 例: `/queens-waltz/blog/my-post` のとき組織スラッグ。未指定は従来どおり `/blog/:slug` 相当。 */
  organizationSlug?: string | null
}

export function BlogDetailPage({ slug, organizationSlug }: BlogDetailPageProps) {
  const navigate = useNavigate()
  const [post, setPost] = useState<BlogPost | null>(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)

  const canonicalPath = organizationSlug ? `/${organizationSlug}/blog/${slug}` : `/blog/${slug}`
  usePageMeta({
    title: post ? blogPageTitle(post.title) : '記事 | MMQ',
    description: post?.excerpt || post?.content?.slice(0, 120),
    canonicalPath,
    image: post?.cover_image_url,
    noindex: notFound,
  })

  useEffect(() => {
    fetchPost()
  }, [slug, organizationSlug])

  const fetchPost = async () => {
    try {
      setLoading(true)
      setNotFound(false)

      const data = await fetchPublishedBlogPost({
        articleSlug: normalizeArticleSlug(slug),
        organizationSlug,
      })

      if (!data) {
        setNotFound(true)
        return
      }

      setPost(data)
      await incrementBlogViewCount(data.id, data.view_count || 0)
    } catch (err) {
      logger.error('ブログ記事取得エラー:', err)
      setNotFound(true)
    } finally {
      setLoading(false)
    }
  }

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return ''
    return formatJstDateJa(dateStr)
  }

  if (loading) {
    return (
      <div className="min-h-screen" style={{ backgroundColor: THEME.background }}>
        <Header />
        <div className="flex items-center justify-center py-32">
          <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
        </div>
      </div>
    )
  }

  if (notFound || !post) {
    return (
      <div className="min-h-screen" style={{ backgroundColor: THEME.background }}>
        <Header />
        <div className="max-w-3xl mx-auto px-4 py-16 text-center">
          <h1 className="text-2xl font-bold text-gray-900 mb-4">記事が見つかりません</h1>
          <p className="text-gray-600 mb-8">
            お探しの記事は存在しないか、非公開になっています。
          </p>
          <Button onClick={() => navigate('/')}>
            トップページに戻る
          </Button>
        </div>
        <Footer />
      </div>
    )
  }

  return (
    <div className="min-h-screen" style={{ backgroundColor: THEME.background }}>
      <Header />

      {/* カバー画像 */}
      {post.cover_image_url && (
        <div className="w-full h-64 md:h-96 bg-gray-200 overflow-hidden">
          <img
            src={post.cover_image_url}
            alt={post.title}
            className="w-full h-full object-cover"
          />
        </div>
      )}

      <article className="max-w-3xl mx-auto px-4 py-8 md:py-12">
        {/* 戻るボタン */}
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate(-1)}
          className="mb-6 -ml-2"
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          戻る
        </Button>

        {/* 種類（特集・キャンペーンのとき） */}
        {post.post_type && post.post_type !== 'news' && (
          <span className="mb-3 inline-block bg-primary px-2 py-0.5 text-xs font-bold text-white">
            {BLOG_POST_TYPE_LABELS[post.post_type]}
          </span>
        )}

        {/* タイトル */}
        <h1 className="text-2xl md:text-4xl font-bold text-gray-900 mb-4">
          {post.title}
        </h1>

        {/* 日付 */}
        <div className="flex items-center gap-2 text-gray-500 mb-8">
          <Calendar className="w-4 h-4" />
          <span>{formatDate(post.published_at || post.created_at)}</span>
        </div>

        {/* 本文 */}
        <ArticleBody content={post.content} organizationId={post.organization_id} />

        {/* ほかの特集・お知らせ */}
        <div className="mt-10 border-t pt-6">
          <Button variant="outline" onClick={() => navigate('/blog')}>
            ほかの特集・お知らせを見る
          </Button>
        </div>

        {/* CTA */}
        <div 
          className="mt-12 p-6 md:p-8 text-center"
          style={{ backgroundColor: THEME.primaryLight }}
        >
          <h2 className="text-xl font-bold mb-4" style={{ color: THEME.primary }}>
            MMQで予約しよう
          </h2>
          <p className="text-gray-600 mb-6">
            全国の店舗からあなたにぴったりの物語を見つけましょう
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Button
              size="lg"
              style={{ backgroundColor: THEME.primary }}
              onClick={() => navigate('/scenario')}
            >
              シナリオを探す
            </Button>
            <Button
              size="lg"
              variant="outline"
              onClick={() => navigate('/signup')}
            >
              新規登録する
            </Button>
          </div>
        </div>
      </article>

      <Footer />
    </div>
  )
}

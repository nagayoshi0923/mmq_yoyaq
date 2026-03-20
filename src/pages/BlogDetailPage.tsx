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
import { ArrowLeft, Calendar, Loader2 } from 'lucide-react'
import { MYPAGE_THEME as THEME } from '@/lib/theme'
import type { BlogPost } from '@/types'

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
    return new Date(dateStr).toLocaleDateString('ja-JP', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    })
  }

  // Markdownをシンプルに変換（改行とリンク）
  const renderContent = (content: string) => {
    return content
      .split('\n')
      .map((line, i) => {
        // 見出し
        if (line.startsWith('### ')) {
          return <h3 key={i} className="text-lg font-bold mt-6 mb-3">{line.slice(4)}</h3>
        }
        if (line.startsWith('## ')) {
          return <h2 key={i} className="text-xl font-bold mt-8 mb-4">{line.slice(3)}</h2>
        }
        if (line.startsWith('# ')) {
          return <h1 key={i} className="text-2xl font-bold mt-8 mb-4">{line.slice(2)}</h1>
        }
        // リスト
        if (line.startsWith('- ')) {
          return <li key={i} className="ml-4">{line.slice(2)}</li>
        }
        // 空行
        if (line.trim() === '') {
          return <br key={i} />
        }
        // 通常の段落
        return <p key={i} className="mb-2">{line}</p>
      })
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
        <div className="prose prose-lg max-w-none text-gray-800 leading-relaxed">
          {renderContent(post.content)}
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

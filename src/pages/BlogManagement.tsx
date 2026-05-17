/**
 * ブログ管理ページ
 * @path /{org}/blog
 */
import { Newspaper } from 'lucide-react'
import { AppLayout } from '@/components/layout/AppLayout'
import { PageHeader } from '@/components/layout/PageHeader'
import { BlogSettings } from './Settings/pages/BlogSettings'

export function BlogManagement() {
  return (
    <AppLayout
      currentPage="blog"
      maxWidth="max-w-6xl"
      containerPadding="px-4 py-6"
    >
      <PageHeader
        title={<><Newspaper className="h-5 w-5" />ブログ管理</>}
        description="記事の作成・編集・公開設定"
      />
      <BlogSettings />
    </AppLayout>
  )
}

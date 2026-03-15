/**
 * ブログ管理ページ
 * @path /{org}/blog
 */
import { AppLayout } from '@/components/layout/AppLayout'
import { BlogSettings } from './Settings/pages/BlogSettings'

export function BlogManagement() {
  return (
    <AppLayout
      currentPage="blog"
      maxWidth="max-w-6xl"
      containerPadding="px-4 py-6"
    >
      <BlogSettings />
    </AppLayout>
  )
}

// ================================================
// ブログ・お知らせ関連の型定義
// ================================================

export interface BlogPost {
  id: string
  organization_id: string
  title: string
  slug: string
  excerpt?: string | null
  content: string
  cover_image_url?: string | null
  is_published: boolean
  published_at?: string | null
  author_id?: string | null
  view_count: number
  created_at: string
  updated_at: string
}

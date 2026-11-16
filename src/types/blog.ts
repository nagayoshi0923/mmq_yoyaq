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
  /** 記事の種類（お知らせ・キャンペーン・キャラ特集・カテゴリ特集） */
  post_type: BlogPostType
  /** トップの「キャンペーン・特集」バナーに出す */
  show_in_top_banner: boolean
  /** バナーの並び順（小さいほど先） */
  banner_order: number
  /** この日時を過ぎたらバナーと記事一覧から外す（null=ずっと） */
  display_until?: string | null
}

export type BlogPostType = 'news' | 'campaign' | 'character_feature' | 'category_feature'

export const BLOG_POST_TYPE_LABELS: Record<BlogPostType, string> = {
  news: 'お知らせ',
  campaign: 'キャンペーン',
  character_feature: 'キャラ特集',
  category_feature: 'カテゴリ特集',
}

export const BLOG_POST_TYPES: BlogPostType[] = ['category_feature', 'character_feature', 'campaign', 'news']

/** バナー・記事一覧に出す公開記事（RPC の最小列） */
export interface PublicBlogPostSummary {
  id: string
  title: string
  slug: string
  excerpt: string | null
  cover_image_url: string | null
  post_type: BlogPostType
  published_at: string | null
  organization_slug: string
  organization_name: string
  banner_order?: number
}

/** 記事に差し込む作品の公開情報（get_public_feature_scenarios） */
export interface FeatureScenario {
  scenario_master_id: string
  slug: string | null
  title: string
  author: string | null
  key_visual_url: string | null
  player_count_min: number | null
  player_count_max: number | null
  duration: number | null
  genre: string[] | null
  release_date: string | null
  organization_slug: string
  characters: FeatureCharacter[]
  next_events: FeatureNextEvent[]
}

export interface FeatureCharacter {
  id: string | null
  name: string | null
  age: string | null
  gender: string | null
  occupation: string | null
  description: string | null
  image_url: string | null
  image_position: string | null
  background_color: string | null
  is_npc: boolean
}

export interface FeatureNextEvent {
  id: string
  date: string
  start_time: string
  store_name: string | null
  available_seats: number
}

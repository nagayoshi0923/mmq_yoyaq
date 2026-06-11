// ================================================
// マルチテナント: 組織関連の型定義
// ================================================

// 組織（会社）の型定義
export interface Organization {
  id: string
  name: string
  slug: string  // URL用識別子（例: queens-waltz, company-a）
  plan: 'free' | 'basic' | 'pro'
  booking_site_status?: 'none' | 'pending' | 'approved'
  contact_email?: string | null
  contact_name?: string | null
  is_license_manager: boolean  // ライセンス管理会社かどうか
  is_active: boolean
  settings?: Record<string, unknown>  // 組織ごとの設定
  notes?: string | null
  theme_color?: string | null  // 組織のイメージカラー（HEX形式、例: #E60012）
  header_image_url?: string | null  // 組織トップページのヘッダー画像URL
  favicon_url?: string | null  // 組織のファビコンURL
  /** 公開予約トップ（/{slug}）ヒーロー直下の紹介文。空ならアプリのデフォルト */
  public_booking_hero_description?: string | null
  post_performance_survey_url?: string | null  // 公演後アンケートURL（組織共通）
  post_performance_survey_enabled?: boolean  // 公演後アンケートを有効にするかどうか
  faq_items?: FAQItem[] | null  // 組織固有のFAQ項目
  common_faq_items?: FAQItem[] | null  // MMQ共通FAQ項目（ライセンス管理者組織のみ）
  created_at: string
  updated_at: string
}

// FAQ項目の型定義
export interface FAQItem {
  question: string
  answer: string
  category?: string
}

// 組織招待の型定義
export interface OrganizationInvitation {
  id: string
  organization_id: string
  email: string
  name: string
  role: string[]
  token: string
  expires_at: string
  accepted_at?: string | null
  staff_id?: string | null
  created_by?: string | null
  created_at: string
  updated_at: string
  // 拡張フィールド（join時に取得）
  organization?: Organization | null
}

// 外部公演報告の型定義

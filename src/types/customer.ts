export interface Customer {
  id: string
  organization_id?: string  // マルチテナント対応（移行期間中はオプショナル）
  user_id?: string | null
  name: string
  nickname?: string | null  // 表示用ニックネーム
  email?: string | null
  email_verified?: boolean
  phone?: string | null
  prefecture?: string | null  // 都道府県
  address?: string | null  // 住所
  line_id?: string | null
  notes?: string | null
  avatar_url?: string | null  // アバター画像URL（Supabase Storage）
  birth_date?: string | null  // 生年月日（YYYY-MM-DD）
  visit_count?: number
  total_spent?: number
  reservation_count?: number  // 予約数（予約テーブルから集計）
  last_visit?: string | null
  preferences?: string[]
  notification_settings?: CustomerNotificationSettings | null
  created_at: string
  updated_at: string
}

// 顧客の通知設定
export interface CustomerNotificationSettings {
  email_notifications: boolean
  reminder_notifications: boolean
  campaign_notifications: boolean
}

// 予約関連の型定義

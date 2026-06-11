export interface PricingModifier {
  id: string
  condition: 'weekday' | 'weekend' | 'holiday' | 'time_range' | 'custom'
  condition_details?: {
    time_start?: string // "09:00"
    time_end?: string   // "18:00"
    custom_description?: string
  }
  modifier_type: 'fixed' | 'percentage'
  participation_modifier: number
  description: string
  active: boolean
}

// GM設定
export interface GMConfiguration {
  required_count: number
  optional_count: number
  total_max: number
  special_requirements?: string
}

// 柔軟な料金設定
export interface FlexiblePricing {
  base_pricing: {
    participation_fee: number
  }
  pricing_modifiers: PricingModifier[]
  gm_configuration: GMConfiguration
}

// シナリオ関連の型定義
export interface Scenario {
  id: string
  slug?: string  // URL用の短い識別子（英数字とハイフン）
  organization_id?: string | null  // マルチテナント対応（managed シナリオは NULL で共有）
  scenario_master_id?: string | null  // マスタから引用した場合のマスタID
  is_shared?: boolean  // 他組織に共有するか
  title: string
  description?: string
  author: string
  author_email?: string | null  // 作者メールアドレス（作者ポータル連携用）
  report_display_name?: string | null  // 報告用表示名（NULLの場合はauthorを使用）
  duration: number
  weekend_duration?: number | null  // 土日・祝日の公演時間（分）。未設定の場合はdurationを使用
  player_count_min: number
  player_count_max: number
  male_count?: number | null  // 男性プレイヤー数（NULLの場合は男女比指定なし）
  female_count?: number | null  // 女性プレイヤー数（NULLの場合は男女比指定なし）
  other_count?: number | null  // その他/性別不問プレイヤー数（NULLの場合は設定なし）
  difficulty: number
  available_gms: string[]
  rating?: number
  play_count: number
  status: 'available' | 'maintenance' | 'retired'
  scenario_type?: 'normal' | 'managed'  // 通常シナリオ or 管理シナリオ
  required_props: Array<{ item: string; amount: number; frequency: 'recurring' | 'one-time' }>
  // データベースカラム（通常ライセンス料）
  license_amount?: number
  // データベースカラム（GMテストライセンス料）
  gm_test_license_amount?: number
  // データベースカラム（他店用/フランチャイズ通常ライセンス料：作者への支払い）
  franchise_license_amount?: number
  // データベースカラム（他店用/フランチャイズGMテストライセンス料：作者への支払い）
  franchise_gm_test_license_amount?: number
  // データベースカラム（他社公演料：他社がMMQに支払う金額）
  external_license_amount?: number
  // データベースカラム（他社GMテスト公演料：他社がMMQに支払う金額）
  external_gm_test_license_amount?: number
  // フランチャイズ公演時：フランチャイズから受け取る金額（通常）
  fc_receive_license_amount?: number
  // フランチャイズ公演時：フランチャイズから受け取る金額（GMテスト）
  fc_receive_gm_test_license_amount?: number
  // フランチャイズ公演時：作者に支払う金額（通常）
  fc_author_license_amount?: number
  // フランチャイズ公演時：作者に支払う金額（GMテスト）
  fc_author_gm_test_license_amount?: number
  // 旧形式（互換性のため保持）
  license_rewards: Array<{ item: string; amount: number; status?: 'active' | 'legacy' | 'unused' | 'ready'; usageCount?: number; startDate?: string; endDate?: string }>
  props?: Array<{
    name: string
    cost: number
    costType: string
  }>
  genre: string[]
  production_cost: number
  production_costs?: Array<{
    item: string
    amount: number
  }>
  depreciation_per_performance?: number // 1公演あたりの償却金額
  kit_count?: number // キット数（制作費自動計算用）
  // GM配置システム
  gm_costs: Array<{ role: string; reward: number; category?: 'normal' | 'gmtest'; status?: 'active' | 'legacy' | 'unused' | 'ready'; usageCount?: number; startDate?: string; endDate?: string }>
  // 新しい時間帯別料金設定
  participation_costs: Array<{ time_slot: string; amount: number; type: 'percentage' | 'fixed'; status?: 'active' | 'legacy' | 'unused' | 'ready'; usageCount?: number; startDate?: string; endDate?: string }>
  participation_fee: number // 基本料金（後方互換性のため保持）
  gm_test_participation_fee?: number // GMテスト参加費（後方互換性のため保持）
  // 新しい柔軟な料金設定
  flexible_pricing?: FlexiblePricing
  notes?: string
  has_pre_reading: boolean
  release_date?: string
  // 顧客向け予約サイト用の追加フィールド
  key_visual_url?: string // キービジュアル画像URL
  synopsis?: string // あらすじ（description より詳細）
  official_site_url?: string // 公式サイトURL
  is_recommended?: boolean // おすすめフラグ（管理者設定）
  created_at: string
  updated_at: string
  // 拡張フィールド（UIで使用）
  experienced_staff?: string[] // このシナリオを担当できるスタッフID
  gm_count?: number // GM配置数
  use_flexible_pricing?: boolean // 柔軟な料金設定を使用
  available_stores?: string[] // 公演可能店舗ID
  gm_assignments?: Array<{ role: string; staff_id?: string; reward?: number }> // GM配置情報
  extra_preparation_time?: number // 追加準備時間（分）。通常の60分に加算される
  private_booking_time_slots?: string[] // 貸切受付可能時間枠・平日（'朝公演', '昼公演', '夜公演'）
  private_booking_time_slots_weekend?: string[] | null // 貸切受付可能時間枠・土日祝（未設定の場合は平日設定を流用）
  private_booking_blocked_slots?: string[] // 貸切ブロック済み時間枠（廃止予定）
  booking_start_date?: string | null // 貸切募集開始日（YYYY-MM-DD）。NULLの場合は制限なし
  booking_end_date?: string | null // 貸切募集終了日（YYYY-MM-DD）。NULLの場合は制限なし
  individual_notice_template?: string | null // 個別お知らせ送信時に添付できる定型文
  character_assignment_method?: 'survey' | 'self' // 配役方法
  org_status?: 'available' | 'unavailable' | 'coming_soon' // 組織側ステータス（生値）
  pricing_patterns?: any[] // 料金パターン
  survey_url?: string | null // アンケートURL
  survey_enabled?: boolean // アンケート有効フラグ
  survey_deadline_days?: number // アンケート締切日数
  characters?: any[] // キャラクター情報
  pre_reading_notice_message?: string | null // 事前読み通知メッセージ
  master_status?: string // マスタステータス
}

// スケジュール関連の型定義

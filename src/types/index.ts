// ================================================
// マルチテナント: 組織関連の型定義
// ================================================

// 組織（会社）の型定義
export interface Organization {
  id: string
  name: string
  slug: string  // URL用識別子（例: queens-waltz, company-a）
  plan: 'free' | 'basic' | 'pro'
  contact_email?: string | null
  contact_name?: string | null
  is_license_manager: boolean  // ライセンス管理会社かどうか
  is_active: boolean
  settings?: Record<string, unknown>  // 組織ごとの設定
  notes?: string | null
  created_at: string
  updated_at: string
}

// 外部公演報告の型定義
export interface ExternalPerformanceReport {
  id: string
  scenario_id: string
  organization_id: string
  reported_by: string  // staff.id
  performance_date: string
  performance_count: number
  participant_count?: number | null
  venue_name?: string | null
  notes?: string | null
  status: 'pending' | 'approved' | 'rejected'
  reviewed_by?: string | null  // staff.id
  reviewed_at?: string | null
  rejection_reason?: string | null
  created_at: string
  updated_at: string
  // 拡張フィールド（join時に取得）
  scenarios?: Scenario | null
  organizations?: Organization | null
  reporter?: Staff | null
  reviewer?: Staff | null
}

// ライセンス集計サマリーの型定義
export interface LicensePerformanceSummary {
  scenario_id: string
  scenario_title: string
  author: string
  license_amount: number
  internal_performance_count: number
  external_performance_count: number
  total_performance_count: number
  total_license_fee: number
}

// ================================================
// 店舗関連の型定義
// ================================================

// 店舗固定費の型定義
export interface StoreFixedCost {
  item: string
  amount: number
  frequency?: 'monthly' | 'yearly' | 'one-time'
  notes?: string
  startDate?: string  // 毎月/毎年の開始時期、または一過性の発生月
  endDate?: string    // 毎月/毎年の終了時期（オプション）
  status?: 'active' | 'legacy'  // アクティブまたは過去の設定
  usageCount?: number  // 使用回数
}

// 店舗関連の型定義
export interface Store {
  id: string
  organization_id?: string  // マルチテナント対応（移行期間中はオプショナル）
  name: string
  short_name: string
  address: string
  phone_number: string
  email: string
  opening_date: string
  manager_name: string
  status: 'active' | 'temporarily_closed' | 'closed'
  ownership_type?: 'corporate' | 'franchise' | 'office'  // 直営店 or フランチャイズ or オフィス
  franchise_fee?: number  // フランチャイズ登録手数料（円）
  capacity: number
  rooms: number
  notes?: string
  color: string
  fixed_costs?: StoreFixedCost[]
  is_temporary?: boolean  // 臨時会場フラグ
  temporary_date?: string  // 【非推奨】temporary_dates を使用してください
  temporary_dates?: string[]  // 臨時会場が使用される日付の配列（例: ["2025-11-01", "2025-11-05"]）
  created_at: string
  updated_at: string
}

// スタッフ関連の型定義
export interface Staff {
  id: string
  organization_id?: string  // マルチテナント対応（移行期間中はオプショナル）
  name: string
  display_name?: string // 追加
  line_name?: string
  x_account?: string
  discord_id?: string
  discord_channel_id?: string
  role: string[]
  stores: string[]
  ng_days: string[]
  want_to_learn: string[]
  available_scenarios: string[]
  notes?: string
  phone?: string
  email?: string
  user_id?: string | null
  availability: string[]
  experience: number
  special_scenarios: string[]
  experienced_scenarios?: string[]
  status: 'active' | 'inactive' | 'on-leave'
  avatar_url?: string | null
  avatar_color?: string | null
  created_at: string
  updated_at: string
}

// 料金修正ルール
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
  organization_id?: string | null  // マルチテナント対応（managed シナリオは NULL で共有）
  is_shared?: boolean  // 他組織に共有するか
  title: string
  description?: string
  author: string
  duration: number
  player_count_min: number
  player_count_max: number
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
  // データベースカラム（他店用/フランチャイズ通常ライセンス料）
  franchise_license_amount?: number
  // データベースカラム（他店用/フランチャイズGMテストライセンス料）
  franchise_gm_test_license_amount?: number
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
  created_at: string
  updated_at: string
  // 拡張フィールド（UIで使用）
  experienced_staff?: string[] // このシナリオを担当できるスタッフID
  gm_count?: number // GM配置数
  use_flexible_pricing?: boolean // 柔軟な料金設定を使用
  available_stores?: string[] // 公演可能店舗ID
  gm_assignments?: Array<{ role: string; staff_id?: string; reward?: number }> // GM配置情報
}

// 顧客向け公演情報（予約サイト用）
export interface PublicScenarioEvent {
  id: string
  scenario_id: string
  scenario_title: string
  scenario_description?: string
  synopsis?: string
  key_visual_url?: string
  author: string
  genre: string[]
  duration: number
  player_count_min: number
  player_count_max: number
  difficulty: number
  rating?: number
  has_pre_reading: boolean
  official_site_url?: string
  // 公演情報
  events: Array<{
    event_id: string
    date: string
    start_time: string
    end_time: string
    store_name: string
    store_short_name: string
    store_color?: string
    store_address?: string
    max_participants: number
    current_participants: number
    available_seats: number
    participation_fee: number
    reservation_deadline_hours: number
  }>
}

// スケジュール関連の型定義
export interface ScheduleEvent {
  id: string
  organization_id?: string  // マルチテナント対応（移行期間中はオプショナル）
  date: string
  venue: string
  scenario: string
  gms: string[]
  start_time: string
  end_time: string
  category: 'open' | 'private' | 'gmtest' | 'testplay' | 'offsite' | 'venue_rental' | 'venue_rental_free' | 'package' | 'mtg'
  reservation_info?: string
  notes?: string
  is_cancelled: boolean
  created_at: string
  updated_at: string
}

// ユーザー関連の型定義
export interface User {
  id: string
  email: string
  role: 'admin' | 'staff' | 'customer'
  created_at: string
  updated_at: string
}

// 注意: 顧客関連の型定義は下記（362行目付近）に定義されています
// 注意: 予約関連の型定義は下記（380行目付近）に定義されています

// 在庫関連の型定義
export interface PerformanceKit {
  id: string
  organization_id?: string  // マルチテナント対応（移行期間中はオプショナル）
  scenario_id: string
  scenario_title: string
  kit_number: number
  condition: 'excellent' | 'good' | 'fair' | 'poor' | 'damaged'
  last_used?: string
  notes?: string
  store_id: string
  created_at: string
  updated_at: string
}

// 店舗識別色の型定義
export type StoreColorTheme = {
  bg: string
  badge: string
  accent: string
  dot: string
}

// 公演カテゴリ色の型定義
export type CategoryColorTheme = {
  badge: string
  card: string
  accent: string
}

// 売上データの型定義
export interface SalesData {
  totalRevenue: number
  totalEvents: number
  averageRevenuePerEvent: number
  totalLicenseCost: number
  totalGmCost: number
  totalProductionCost: number
  totalPropsCost: number
  totalFixedCost: number
  fixedCostBreakdown: Array<{
    item: string
    amount: number
    store: string
  }>
  productionCostBreakdown: Array<{
    item: string
    amount: number
    scenario: string
  }>
  propsCostBreakdown: Array<{
    item: string
    amount: number
    scenario: string
  }>
  totalVariableCost: number
  variableCostBreakdown: Array<{
    category: string
    amount: number
  }>
  netProfit: number
  storeRanking: Array<{
    id: string
    name: string
    revenue: number
    events: number
    averageRevenue: number
    licenseCost: number
    gmCost: number
    franchiseFee?: number
    netProfit: number
  }>
  scenarioRanking: Array<{
    id: string
    title: string
    revenue: number
    events: number
    averageRevenue: number
    licenseCost: number
    gmCost: number
    netProfit: number
  }>
  chartData: {
    labels: string[]
    datasets: Array<{
      label: string
      data: number[]
      borderColor: string
      backgroundColor: string
      tension: number
    }>
  }
  eventList: Array<{
    id: string
    date: string
    store_name: string
    scenario_title: string
    revenue: number
    license_cost: number
    gm_cost: number
    net_profit: number
    participant_count: number
    category?: string
  }>
  // 月別売上推移（エクスポート用）
  monthlyRevenue?: Array<{
    month: string
    revenue: number
    events: number
  }>
}

// 顧客関連の型定義
export interface Customer {
  id: string
  organization_id?: string  // マルチテナント対応（移行期間中はオプショナル）
  user_id?: string | null
  name: string
  email?: string | null
  email_verified?: boolean
  phone?: string | null
  line_id?: string | null
  notes?: string | null
  visit_count: number
  total_spent: number
  last_visit?: string | null
  preferences?: string[]
  created_at: string
  updated_at: string
}

// 予約関連の型定義
export interface Reservation {
  id: string
  organization_id?: string  // マルチテナント対応（移行期間中はオプショナル）
  reservation_number: string
  reservation_page_id?: string | null
  title: string
  scenario_id?: string | null
  store_id?: string | null
  customer_id?: string | null
  schedule_event_id?: string | null // 新規追加
  requested_datetime: string
  actual_datetime?: string | null
  duration: number
  participant_count: number
  participant_names?: string[]
  assigned_staff?: string[]
  gm_staff?: string | null
  base_price: number
  options_price: number
  total_price: number
  discount_amount: number
  final_price: number
  payment_status: 'pending' | 'paid' | 'refunded' | 'cancelled'
  payment_method?: string | null
  payment_datetime?: string | null
  status: 'pending' | 'confirmed' | 'completed' | 'cancelled' | 'no_show' | 'gm_confirmed'
  customer_notes?: string | null
  staff_notes?: string | null
  special_requests?: string | null
  cancellation_reason?: string | null
  cancelled_at?: string | null
  external_reservation_id?: string | null
  reservation_source: 'web' | 'phone' | 'walk_in' | 'external' | 'web_private' | 'staff_entry' | 'staff_participation' | 'demo_auto' | 'demo'
  created_at: string
  updated_at: string
  // 予約サイトから直接保存される顧客情報（web, web_private予約の場合）
  customer_name?: string | null
  customer_email?: string | null
  customer_phone?: string | null
  // Supabaseのjoinクエリで取得される拡張フィールド
  customers?: Customer | Customer[] | null
  // 貸切予約の候補日時情報
  candidate_datetimes?: CandidateDatetimes | null
}

// 貸切予約の候補日時情報
export interface CandidateDatetimes {
  candidates?: Array<{
    date: string
    time_slot: string
    start_time?: string
    end_time?: string
  }>
  confirmedStore?: {
    storeId: string
    storeName?: string
  }
  confirmedDateTime?: {
    date: string
    time_slot: string
    start_time?: string
    end_time?: string
  }
  requestedStores?: string[]
}

// 予約サマリー（ビューから取得）
export interface ReservationSummary {
  schedule_event_id: string
  date: string
  venue: string
  scenario: string
  start_time: string
  end_time: string
  max_participants?: number | null
  current_reservations: number
  available_seats: number
  reservation_count: number
}

// スケジュールイベントに予約関連フィールドを追加
export interface ScheduleEventWithReservations {
  id: string
  organization_id?: string  // マルチテナント対応（移行期間中はオプショナル）
  date: string
  venue: string
  scenario: string
  gms: string[]
  start_time: string
  end_time: string
  category: 'open' | 'private' | 'gmtest' | 'testplay' | 'offsite' | 'venue_rental' | 'venue_rental_free' | 'package' | 'mtg'
  status: string
  current_participants?: number // DBカラム名に統一（旧: participant_count）
  max_participants?: number
  reservation_deadline_hours?: number
  is_reservation_enabled?: boolean
  reservation_notes?: string
  current_reservations?: number // 計算値
  available_seats?: number // 計算値
  notes?: string
  is_cancelled: boolean
}

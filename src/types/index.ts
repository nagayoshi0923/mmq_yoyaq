// 店舗関連の型定義
export interface Store {
  id: string
  name: string
  short_name: string
  address: string
  phone_number: string
  email: string
  opening_date: string
  manager_name: string
  status: 'active' | 'temporarily_closed' | 'closed'
  capacity: number
  rooms: number
  notes?: string
  color: string
  created_at: string
  updated_at: string
}

// スタッフ関連の型定義
export interface Staff {
  id: string
  name: string
  line_name?: string
  x_account?: string
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
  required_props: Array<{ item: string; amount: number; frequency: 'recurring' | 'one-time' }>
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
  gm_costs: Array<{ role: string; reward: number; status?: 'active' | 'legacy' | 'unused' | 'ready'; usageCount?: number; startDate?: string; endDate?: string }>
  // 新しい時間帯別料金設定
  participation_costs: Array<{ time_slot: string; amount: number; type: 'percentage' | 'fixed'; status?: 'active' | 'legacy' | 'unused' | 'ready'; usageCount?: number; startDate?: string; endDate?: string }>
  participation_fee: number // 基本料金（後方互換性のため保持）
  // 新しい柔軟な料金設定
  flexible_pricing?: FlexiblePricing
  notes?: string
  has_pre_reading: boolean
  release_date?: string
  created_at: string
  updated_at: string
}

// スケジュール関連の型定義
export interface ScheduleEvent {
  id: string
  date: string
  venue: string
  scenario: string
  gms: string[]
  start_time: string
  end_time: string
  category: 'open' | 'private' | 'gmtest' | 'testplay' | 'offsite'
  reservation_info?: string
  notes?: string
  is_cancelled: boolean
  created_at: string
  updated_at: string
}

// 予約関連の型定義
export interface Reservation {
  id: string
  reservation_number: string
  reservation_page_id?: string
  title: string
  scenario_id: string
  store_id: string
  customer_id: string
  requested_datetime: string
  actual_datetime?: string
  duration: number
  participant_count: number
  participant_names: string[]
  assigned_staff: string[]
  gm_staff?: string
  base_price: number
  options_price: number
  total_price: number
  discount_amount: number
  final_price: number
  payment_status: string
  payment_method?: string
  payment_datetime?: string
  status: string
  customer_notes?: string
  staff_notes?: string
  special_requests?: string
  cancellation_reason?: string
  cancelled_at?: string
  external_reservation_id?: string
  reservation_source: string
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

// 顧客関連の型定義
export interface Customer {
  id: string
  user_id: string
  name: string
  phone?: string
  line_id?: string
  notes?: string
  visit_count: number
  total_spent: number
  last_visit?: string
  preferences?: string[]
  created_at: string
  updated_at: string
}

// 在庫関連の型定義
export interface PerformanceKit {
  id: string
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
  monthlyRevenue: Array<{
    month: string
    revenue: number
    events: number
  }>
  dailyRevenue: Array<{
    date: string
    revenue: number
    events: number
  }>
  storeRanking: Array<{
    id: string
    name: string
    revenue: number
    events: number
    averageRevenue: number
  }>
  scenarioRanking: Array<{
    id: string
    title: string
    revenue: number
    events: number
    averageRevenue: number
  }>
}

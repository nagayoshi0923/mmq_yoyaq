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
  availability: string[]
  experience: number
  special_scenarios: string[]
  status: 'active' | 'inactive' | 'on-leave'
  created_at: string
  updated_at: string
}

// シナリオ関連の型定義
export interface Scenario {
  id: string
  title: string
  description?: string
  author: string
  license_amount: number
  duration: number
  player_count_min: number
  player_count_max: number
  difficulty: number
  available_gms: string[]
  rating?: number
  play_count: number
  status: 'available' | 'maintenance' | 'retired'
  required_props: string[]
  props?: Array<{
    name: string
    cost: number
    costType: string
  }>
  genre: string[]
  production_cost: number
  production_cost_items?: Array<{
    name: string
    cost: number
  }>
  gm_fee: number
  participation_fee: number
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

import type { Customer } from './customer'
import type { ScheduleEvent } from './scheduleEvent'

export interface Reservation {
  id: string
  organization_id?: string  // マルチテナント対応（移行期間中はオプショナル）
  reservation_number: string
  reservation_page_id?: string | null
  title: string
  scenario_id?: string | null
  /** 貸切フロー等で設定（シナリオ表示用） */
  scenario_title?: string | null
  scenario_master_id?: string | null
  private_group_id?: string | null
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
  unit_price?: number  // 予約時点の1人あたり参加料金
  payment_status: 'pending' | 'paid' | 'refunded' | 'cancelled'
  payment_method?: string | null
  payment_datetime?: string | null
  status: 'pending' | 'confirmed' | 'checked_in' | 'completed' | 'cancelled' | 'no_show' | 'gm_confirmed'
  arrived_late?: boolean  // 遅刻して来店したか（checked_in時のみ意味を持つ）
  customer_notes?: string | null
  staff_notes?: string | null
  special_requests?: string | null
  cancellation_reason?: string | null
  cancelled_at?: string | null
  external_reservation_id?: string | null
  reservation_source: 'web' | 'phone' | 'walk_in' | 'external' | 'web_private' | 'staff_entry' | 'staff_participation' | 'demo_auto' | 'demo'
  created_by?: string | null
  created_at: string
  updated_at: string
  // 予約サイトから直接保存される顧客情報（web, web_private予約の場合）
  customer_name?: string | null
  customer_email?: string | null
  customer_phone?: string | null
  // クーポン使用の紐付け
  coupon_usage_id?: string | null
  // Supabaseのjoinクエリで取得される拡張フィールド
  customers?: Customer | Customer[] | null
  /** schedule_events 埋め込み（PostgREST / 型推論で object または 1要素相当の array になり得る） */
  schedule_events?:
    | {
        id?: string
        date?: string
        start_time?: string
        end_time?: string
        venue?: string
        scenario?: string
        store_id?: string | null
        organization_id?: string
        is_private_booking?: boolean
        gms?: string[]
      }
    | Array<{
        id?: string
        date?: string
        start_time?: string
        end_time?: string
        venue?: string
        scenario?: string
        store_id?: string | null
        organization_id?: string
        is_private_booking?: boolean
        gms?: string[]
      }>
    | null
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

// キャンセル待ちの型定義
export interface Waitlist {
  id: string
  organization_id: string
  schedule_event_id: string
  customer_id: string
  customer_name: string
  customer_email: string
  customer_phone?: string | null
  participant_count: number
  status: 'waiting' | 'notified' | 'expired' | 'converted'
  notified_at?: string | null
  expires_at?: string | null
  notes?: string | null
  created_at: string
  updated_at: string
  // 拡張フィールド（join時に取得）
  schedule_events?: ScheduleEvent | null
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

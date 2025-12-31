/**
 * API共通の型定義
 */

// 候補日時の型定義
export interface CandidateDateTime {
  order: number
  date: string
  startTime?: string
  endTime?: string
  status?: 'confirmed' | 'pending' | 'rejected'
}

// GM空き状況レスポンスの型定義
export interface GMAvailabilityResponse {
  response_status: 'available' | 'unavailable'
  staff?: {
    name: string
  }
}

// スケジュールイベントの型定義（schedule_eventsテーブル互換）
export interface ScheduleEvent {
  id: string
  date: string
  venue: string
  store_id: string
  scenario: string
  scenario_id: string
  start_time: string
  end_time: string
  category: string
  is_cancelled: boolean
  is_reservation_enabled: boolean
  current_participants: number
  max_participants: number
  capacity: number
  gms: string[]
  gm_roles?: Record<string, string> // { "GM名": "main" | "sub" | "staff" }
  stores?: unknown
  scenarios?: unknown
  is_private_booking?: boolean
  timeSlot?: string // 時間帯（朝/昼/夜）
  organization_id?: string // マルチテナント対応
}

// ページネーション用のレスポンス型
export interface PaginatedResponse<T> {
  data: T[]
  count: number
  hasMore: boolean
}


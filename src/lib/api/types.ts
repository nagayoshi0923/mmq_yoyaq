import type { ScheduleEventBase } from '@/types/scheduleEventBase'

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
export interface ScheduleEvent extends ScheduleEventBase {
  store_id: string
  scenario_master_id: string
  category: string
  is_reservation_enabled: boolean
  current_participants: number
  max_participants: number
  capacity: number
  gm_roles?: Record<string, string> // { "GM名": "main" | "sub" | "staff" }
  stores?: unknown
  scenarios?: unknown
  is_private_booking?: boolean
  timeSlot?: string // 時間帯（朝/昼/夜）
}

// ページネーション用のレスポンス型
export interface PaginatedResponse<T> {
  data: T[]
  count: number
  hasMore: boolean
}


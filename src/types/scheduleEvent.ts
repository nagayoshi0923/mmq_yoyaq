import type { ScheduleEventBase, ScheduleEventCategory } from '@/types/scheduleEventBase'

/**
 * 予約に付いて読む公演（reservations.schedule_events）。作成・更新日時と、空になりうる time_slot を持つ。
 * 画面で扱う公演は '@/types/schedule' の ScheduleEvent を使う。
 */
export interface ReservationScheduleEvent extends ScheduleEventBase {
  time_slot?: string | null  // 時間帯（morning/afternoon/evening）
  category: ScheduleEventCategory
  reservation_info?: string
  notes?: string
  created_at: string
  updated_at: string
}

// ユーザー関連の型定義

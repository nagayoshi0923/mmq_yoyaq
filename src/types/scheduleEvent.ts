import type { ScheduleEventBase, ScheduleEventCategory } from '@/types/scheduleEventBase'

/** 旧バレル向けモデル。日時履歴とnullable time_slotを維持する。 */

export interface ScheduleEvent extends ScheduleEventBase {
  time_slot?: string | null  // 時間帯（morning/afternoon/evening）
  category: ScheduleEventCategory
  reservation_info?: string
  notes?: string
  created_at: string
  updated_at: string
}

// ユーザー関連の型定義

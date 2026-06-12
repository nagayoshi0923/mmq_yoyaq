/**
 * スケジュールイベント操作の純関数群
 *
 * useEventOperations.ts（Phase 4 で分割中）から抽出した、副作用のない計算ロジック。
 * 時間重複判定は公演の二重予約を防ぐ最重要ロジックのため、
 * src/utils/__tests__/eventOperationUtils.test.ts でユニットテストしている。
 */
import type { ScheduleEvent } from '@/types/schedule'
import { getTimeSlot } from '@/utils/scheduleUtils'
import { PRIVATE_BOOKING_EVENT_INTERVAL_MINUTES } from '@/lib/privateBookingScenarioTime'
import { scheduleTimeSlotToEn } from '@/lib/timeSlot'

/**
 * イベントの時間帯を取得（保存された枠を優先）
 */
export function getEventTimeSlot(
  event: ScheduleEvent | { start_time: string; timeSlot?: string; time_slot?: string | null }
): 'morning' | 'afternoon' | 'evening' {
  // ScheduleEvent.time_slot または ローカル型の timeSlot を参照
  const timeSlotValue = 'timeSlot' in event ? event.timeSlot : event.time_slot
  const savedSlot = scheduleTimeSlotToEn(timeSlotValue)
  if (savedSlot) return savedSlot
  return getTimeSlot(event.start_time)
}

/**
 * 時間文字列を分に変換（HH:MM:SS または HH:MM 形式）
 */
export function timeToMinutes(time: string): number {
  const parts = time.split(':')
  return parseInt(parts[0]) * 60 + parseInt(parts[1])
}

/**
 * 開始時刻と所要時間（分）から終了時刻を計算（HH:MM形式）
 */
export function calcEndTime(startTime: string, durationMinutes: number): string {
  const total = timeToMinutes(startTime) + durationMinutes
  const h = Math.floor(total / 60)
  const m = total % 60
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`
}

/**
 * 2つの時間帯が重複しているかチェック（インターバル + 準備時間を考慮）
 *
 * - 標準インターバル: PRIVATE_BOOKING_EVENT_INTERVAL_MINUTES (60分)。
 *   設営・撤収時間として常に必要。
 * - extra_preparation_time: シナリオごとの「追加準備時間（分）」。標準60分に加算される。
 *
 * @param start1 既存公演の開始時間
 * @param end1 既存公演の終了時間
 * @param start2 新規公演の開始時間
 * @param end2 新規公演の終了時間
 * @param prepMinutes1 既存公演の extra_preparation_time（分）
 * @param prepMinutes2 新規公演の extra_preparation_time（分）
 * @returns { overlap: boolean, reason?: string } 重複情報
 */
export function checkTimeOverlap(
  start1: string,
  end1: string,
  start2: string,
  end2: string,
  prepMinutes1: number = 0,
  prepMinutes2: number = 0
): { overlap: boolean; reason?: string } {
  const s1 = timeToMinutes(start1)
  const e1 = timeToMinutes(end1)
  const s2 = timeToMinutes(start2)
  const e2 = timeToMinutes(end2)

  // 必要な間隔 = 標準60分 + シナリオの追加準備時間
  const buffer1 = PRIVATE_BOOKING_EVENT_INTERVAL_MINUTES + prepMinutes1
  const buffer2 = PRIVATE_BOOKING_EVENT_INTERVAL_MINUTES + prepMinutes2

  // 1. 純粋な時間の重複チェック
  if (!(e1 <= s2 || e2 <= s1)) {
    return { overlap: true, reason: '時間が重複' }
  }

  // 2. 既存公演 → 新規公演 の順：既存終了 + 新規の必要間隔 > 新規開始 → 不足
  if (e1 <= s2 && e1 + buffer2 > s2) {
    return { overlap: true, reason: `間隔不足（次の公演の前に${buffer2}分必要）` }
  }

  // 3. 新規公演 → 既存公演 の順：新規終了 + 既存の必要間隔 > 既存開始 → 不足
  if (e2 <= s1 && e2 + buffer1 > s1) {
    return { overlap: true, reason: `間隔不足（次の公演の前に${buffer1}分必要）` }
  }

  return { overlap: false }
}

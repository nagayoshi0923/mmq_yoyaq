import {
  getPerformanceDurationMinutesForDate,
  performanceConflictsWithScheduledEvent,
  type ScenarioTimingFromDb,
} from '@/lib/privateBookingScenarioTime'

/** schedule_events 等の最小形 */
export type ScheduleEventLike = {
  start_time?: string | null
  end_time?: string | null
  date?: string | null
  store_id?: string | null
}

export function timeStrToMinutes(t: string | null | undefined): number | null {
  if (t == null || typeof t !== 'string' || !t.includes(':')) return null
  const parts = t.trim().slice(0, 8).split(':')
  const h = parseInt(parts[0] || '0', 10)
  const m = parseInt(parts[1] || '0', 10)
  if (Number.isNaN(h) || Number.isNaN(m)) return null
  return h * 60 + m
}

export type PrivateBookingScenarioTimingSlice = Pick<
  ScenarioTimingFromDb,
  'duration' | 'weekend_duration' | 'extra_preparation_time'
>

/**
 * 貸切グループ候補追加と通常貸切（シナリオ詳細）で共通:
 * - シナリオ所要（土日祝は weekend_duration）+ 追加準備で占有終了
 * - 枠の終了（slotEndMin）内に収まること
 * - 既存公演との間に 60 分インターバル（performanceConflictsWithScheduledEvent）
 */
export function isPrivateBookingSlotAvailableForStore(
  dateStr: string,
  slotStartMin: number,
  slotEndMin: number,
  scenarioTiming: PrivateBookingScenarioTimingSlice,
  storeId: string,
  events: ScheduleEventLike[],
  isCustomHoliday: (d: string) => boolean
): boolean {
  const durationMin = getPerformanceDurationMinutesForDate(dateStr, scenarioTiming, isCustomHoliday)
  const extraPrep = scenarioTiming.extra_preparation_time || 0
  const perfOccEnd = slotStartMin + durationMin + extraPrep
  if (perfOccEnd > slotEndMin) return false

  const day = dateStr.split('T')[0]

  for (const event of events) {
    if (event.store_id !== storeId) continue
    const ed = event.date ? String(event.date).split('T')[0] : ''
    if (ed !== day) continue

    const eventStart = timeStrToMinutes(event.start_time ?? undefined)
    if (eventStart === null) continue
    const eventEnd = timeStrToMinutes(event.end_time ?? undefined) ?? eventStart + 240

    if (performanceConflictsWithScheduledEvent(slotStartMin, perfOccEnd, eventStart, eventEnd)) {
      return false
    }
  }

  return true
}

/** 希望店舗が複数のとき: いずれかの店舗で受付可能なら true（貸切グループのマージ枠用） */
export function isPrivateBookingSlotAvailableOnAnyStore(
  dateStr: string,
  slotStartMin: number,
  slotEndMin: number,
  scenarioTiming: PrivateBookingScenarioTimingSlice,
  storeIds: string[],
  events: ScheduleEventLike[],
  isCustomHoliday: (d: string) => boolean
): boolean {
  if (storeIds.length === 0) return true
  return storeIds.some(storeId =>
    isPrivateBookingSlotAvailableForStore(
      dateStr,
      slotStartMin,
      slotEndMin,
      scenarioTiming,
      storeId,
      events,
      isCustomHoliday
    )
  )
}

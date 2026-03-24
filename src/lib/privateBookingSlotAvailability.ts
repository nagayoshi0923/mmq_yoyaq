import {
  getPerformanceDurationMinutesForDate,
  type ScenarioTimingFromDb,
} from '@/lib/privateBookingScenarioTime'
import type { BusinessHoursSettingRow } from '@/lib/privateGroupCandidateSlots'
import {
  getPrivateBookingStoreSlotFeasibility,
  isProposedPrivateBookingStartFeasible,
  type PrivateBookingSlotKey,
} from '@/lib/privateBookingStoreSlotFeasibility'

/** schedule_events 等の最小形 */
export type ScheduleEventLike = {
  start_time?: string | null
  end_time?: string | null
  date?: string | null
  store_id?: string | null
  stores?: { id?: string | null } | null
}

export type { PrivateBookingSlotKey }

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
 * 貸切グループ候補追加・シナリオ詳細と同一ルール:
 * business_hours_settings 由来の枠（getPerStoreSlotsForDate）と、
 * 同日の公演（枠と重なるものは終了+1h 後まで次を詰めない）を見て判定する。
 */
export function isPrivateBookingSlotAvailableForStore(
  dateStr: string,
  slotKey: PrivateBookingSlotKey,
  proposedStartMin: number,
  scenarioTiming: PrivateBookingScenarioTimingSlice,
  storeId: string,
  events: ScheduleEventLike[],
  isCustomHoliday: (d: string) => boolean,
  businessRow: BusinessHoursSettingRow | undefined,
  allowSyntheticWhenMissingRow: boolean
): boolean {
  const day = dateStr.split('T')[0]
  const f = getPrivateBookingStoreSlotFeasibility(
    day,
    storeId,
    slotKey,
    businessRow,
    events,
    isCustomHoliday,
    allowSyntheticWhenMissingRow
  )
  if (!f) return false
  const durationMin = getPerformanceDurationMinutesForDate(dateStr, scenarioTiming, isCustomHoliday)
  const extraPrep = scenarioTiming.extra_preparation_time || 0
  // 注: 平日昼の「枠終了からの逆算開始」はシナリオ詳細（usePrivateBooking）側で表示時刻に反映する。
  // ここは getPrivateGroupCandidateSlots の開始時刻（例: 午後 13:00）を proposed として渡すため、
  // effectiveMinStartMin（逆算下限）を掛けると常に不一致になり、グループ候補日 UI が全滅する。
  return isProposedPrivateBookingStartFeasible(f, proposedStartMin, durationMin, extraPrep, {
    targetDateYmd: day,
    storeId,
    dayEvents: events,
  })
}

/** 希望店舗が複数のとき: いずれかの店舗で受付可能なら true */
export function isPrivateBookingSlotAvailableOnAnyStore(
  dateStr: string,
  slotKey: PrivateBookingSlotKey,
  proposedStartMin: number,
  scenarioTiming: PrivateBookingScenarioTimingSlice,
  storeIds: string[],
  hoursByStoreId: Map<string, BusinessHoursSettingRow>,
  events: ScheduleEventLike[],
  isCustomHoliday: (d: string) => boolean
): boolean {
  if (storeIds.length === 0) return true
  const allowSynthetic = storeIds.length === 1
  return storeIds.some((storeId) =>
    isPrivateBookingSlotAvailableForStore(
      dateStr,
      slotKey,
      proposedStartMin,
      scenarioTiming,
      storeId,
      events,
      isCustomHoliday,
      hoursByStoreId.get(storeId),
      allowSynthetic
    )
  )
}

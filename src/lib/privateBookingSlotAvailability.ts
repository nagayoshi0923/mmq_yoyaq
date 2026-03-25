import {
  getPerformanceDurationMinutesForDate,
  type ScenarioTimingFromDb,
} from '@/lib/privateBookingScenarioTime'
import type { BusinessHoursSettingRow } from '@/lib/privateGroupCandidateSlots'
import {
  getPrivateBookingStoreSlotFeasibility,
  isProposedPrivateBookingStartFeasible,
  PRIVATE_BOOKING_DAY_END_MINUTES,
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
  // 夜枠は最終枠のため、準備時間は営業終了後に延長可能
  const occupancyEndOverride =
    proposedStartMin + durationMin + extraPrep > f.slotBandEnd
      ? PRIVATE_BOOKING_DAY_END_MINUTES + (slotKey === 'evening' ? extraPrep : 0)
      : undefined

  let effectiveMinStartMin: number | undefined = undefined
  if (slotKey === 'evening' && proposedStartMin < f.slotBandStart) {
    // 長時間作品の夜枠: 枠開始前からの開始を許可、前の公演との衝突は防ぐ
    let latestPriorEndWithBuffer = 0
    for (const e of events) {
      const ed = e.date ? String(e.date).split('T')[0] : ''
      if (ed !== day) continue
      const sid = e.store_id ?? e.stores?.id ?? null
      if (sid !== storeId) continue
      if (!e.start_time) continue
      const eStart = timeStrToMinutes(e.start_time)
      if (eStart === null || eStart > proposedStartMin) continue
      const eEnd = e.end_time ? (timeStrToMinutes(e.end_time) ?? eStart + 240) : eStart + 240
      const endBuf = eEnd + 60
      if (endBuf > latestPriorEndWithBuffer) latestPriorEndWithBuffer = endBuf
    }
    effectiveMinStartMin = latestPriorEndWithBuffer
  }

  // 注: 平日昼の「枠終了からの逆算開始」はシナリオ詳細（usePrivateBooking）側で表示時刻に反映する。
  // ここは getPrivateGroupCandidateSlots の開始時刻（例: 午後 13:00）を proposed として渡すため、
  // effectiveMinStartMin（逆算下限）を掛けると常に不一致になり、グループ候補日 UI が全滅する。
  return isProposedPrivateBookingStartFeasible(f, proposedStartMin, durationMin, extraPrep, {
    targetDateYmd: day,
    storeId,
    dayEvents: events,
  }, effectiveMinStartMin, occupancyEndOverride)
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

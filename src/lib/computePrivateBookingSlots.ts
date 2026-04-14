/**
 * 貸切タイムスロット生成の共通ロジック。
 *
 * シナリオ詳細ページ（usePrivateBooking）とグループ候補日追加（AddCandidateDates）、
 * 予約リクエストページで同一の結果を返すために統合した純粋関数。
 *
 * 内部では既存のヘルパーを活用:
 * - getPrivateBookingStoreSlotFeasibility (営業時間 + 既存公演から枠ごとの最早開始を算出)
 * - isProposedPrivateBookingStartFeasible (提案開始が営業枠に収まるか検証)
 * - getPerformanceDurationMinutesForDate  (平日/土日祝で所要時間を決定)
 */

import { isJapaneseHoliday } from '@/utils/japaneseHolidays'
import { getDayOfWeekJST } from '@/utils/dateUtils'
import {
  getPerformanceDurationMinutesForDate,
  PRIVATE_BOOKING_EVENT_INTERVAL_MINUTES,
  isPrivateBookingSlotAllowedByScenarioSettings,
} from '@/lib/privateBookingScenarioTime'
import type { BusinessHoursSettingRow } from '@/lib/privateGroupCandidateSlots'
import {
  getPrivateBookingStoreSlotFeasibility,
  isProposedPrivateBookingStartFeasible,
  PRIVATE_BOOKING_DAY_END_MINUTES,
} from '@/lib/privateBookingStoreSlotFeasibility'
import { timeStrToMinutes, type ScheduleEventLike } from '@/lib/privateBookingSlotAvailability'

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface ComputePrivateBookingSlotsParams {
  date: string
  storeIds: string[]
  businessHoursByStore: Map<string, BusinessHoursSettingRow>
  scenarioTiming: {
    duration: number
    weekend_duration: number | null
    extra_preparation_time?: number
  }
  allStoreEvents: ScheduleEventLike[]
  isCustomHoliday: (date: string) => boolean
  privateBookingTimeSlots?: string[]
}

export interface PrivateBookingSlot {
  key: 'morning' | 'afternoon' | 'evening'
  label: '午前' | '午後' | '夜'
  startTime: string
  endTime: string
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

type SlotKey = 'morning' | 'afternoon' | 'evening'

const HARD_DAY_LIMIT = PRIVATE_BOOKING_DAY_END_MINUTES // 23:00

function minutesToTime(minutes: number): string {
  const h = Math.floor(minutes / 60) % 24
  const m = minutes % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

type SlotCandidate = {
  earliestStart: number
  slotEnd: number
  slotBaselineStart: number
  priorEventEarliestStartMin: number
}

/**
 * 指定スロットについて、全候補店舗の中で最も早く開始できるパターンを返す。
 * どの店舗でも枠が成立しなければ null。
 */
function getBestSlotCandidateAcrossStores(
  targetDate: string,
  storeIds: string[],
  slotKey: SlotKey,
  businessHoursByStore: Map<string, BusinessHoursSettingRow>,
  allStoreEvents: ScheduleEventLike[],
  isCustomHoliday: (d: string) => boolean,
  isWeekendOrHoliday: boolean,
  durationMinutes: number,
  extraPrepTime: number,
): SlotCandidate | null {
  const allowSynthetic = storeIds.length === 1
  const candidates: SlotCandidate[] = []

  for (const storeId of storeIds) {
    const row = businessHoursByStore.get(storeId)
    const f = getPrivateBookingStoreSlotFeasibility(
      targetDate, storeId, slotKey, row, allStoreEvents, isCustomHoliday, allowSynthetic,
    )
    if (!f) continue

    let startForFeasibility: number

    if (
      slotKey === 'evening' &&
      f.slotBandStart + durationMinutes > HARD_DAY_LIMIT
    ) {
      const reverseStart = HARD_DAY_LIMIT - durationMinutes
      let latestPriorEnd = 0
      for (const ev of allStoreEvents) {
        const ed = ev.date ? String(ev.date).split('T')[0] : ''
        if (ed !== targetDate) continue
        const sid = ev.store_id ?? ev.stores?.id ?? null
        if (sid !== storeId) continue
        if (!ev.start_time) continue
        const eStart = timeStrToMinutes(String(ev.start_time))
        if (eStart === null || eStart > reverseStart) continue
        const eEnd = ev.end_time
          ? (timeStrToMinutes(String(ev.end_time)) ?? eStart + 240)
          : eStart + 240
        const endBuf = eEnd + 60
        if (endBuf > latestPriorEnd) latestPriorEnd = endBuf
      }
      startForFeasibility = Math.max(reverseStart, latestPriorEnd)
    } else {
      startForFeasibility = f.minAllowedStart
    }

    const effectiveMin =
      slotKey === 'evening' && startForFeasibility < f.slotBandStart
        ? startForFeasibility
        : startForFeasibility

    const multiOccupancyOverride =
      startForFeasibility + durationMinutes + extraPrepTime > f.slotBandEnd
        ? HARD_DAY_LIMIT + (slotKey === 'evening' ? extraPrepTime : 0)
        : undefined

    if (
      !isProposedPrivateBookingStartFeasible(
        f,
        startForFeasibility,
        durationMinutes,
        extraPrepTime,
        { targetDateYmd: targetDate, storeId, dayEvents: allStoreEvents },
        effectiveMin,
        multiOccupancyOverride,
      )
    ) {
      continue
    }

    candidates.push({
      earliestStart: startForFeasibility,
      slotEnd: f.slotBandEnd,
      slotBaselineStart: f.slotBandStart,
      priorEventEarliestStartMin: f.priorEventEarliestStartMin,
    })
  }

  if (candidates.length === 0) return null
  return candidates.reduce((a, b) => (a.earliestStart < b.earliestStart ? a : b))
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

export function computePrivateBookingSlots(
  params: ComputePrivateBookingSlotsParams,
): PrivateBookingSlot[] {
  const {
    date,
    storeIds,
    businessHoursByStore,
    scenarioTiming,
    allStoreEvents,
    isCustomHoliday,
    privateBookingTimeSlots,
  } = params

  if (storeIds.length === 0) return []

  const targetDate = date.split('T')[0]
  const dayOfWeek = getDayOfWeekJST(targetDate)
  const isWeekendOrHoliday =
    dayOfWeek === 0 ||
    dayOfWeek === 6 ||
    isJapaneseHoliday(targetDate) ||
    isCustomHoliday(targetDate)

  const durationMinutes = getPerformanceDurationMinutesForDate(
    targetDate,
    scenarioTiming,
    isCustomHoliday,
  )
  const extraPrepTime = scenarioTiming.extra_preparation_time || 0

  const getFeasibility = (slotKey: SlotKey) =>
    getBestSlotCandidateAcrossStores(
      targetDate,
      storeIds,
      slotKey,
      businessHoursByStore,
      allStoreEvents,
      isCustomHoliday,
      isWeekendOrHoliday,
      durationMinutes,
      extraPrepTime,
    )

  const morningCandidate = getFeasibility('morning')
  const afternoonCandidate = getFeasibility('afternoon')
  const eveningCandidate = getFeasibility('evening')

  // Weekday: long-format (morning only) vs normal (afternoon only)
  let weekdayMorningOnly = false
  if (!isWeekendOrHoliday) {
    const eveningBaseStart = eveningCandidate?.slotBaselineStart ?? 19 * 60
    const eveningDeadline =
      eveningBaseStart - PRIVATE_BOOKING_EVENT_INTERVAL_MINUTES
    const reverseFromEvening =
      eveningDeadline - durationMinutes - extraPrepTime
    const afternoonDefault = afternoonCandidate?.slotBaselineStart ?? 13 * 60
    weekdayMorningOnly = reverseFromEvening < afternoonDefault
  }

  const slotDefs: {
    key: SlotKey
    label: '午前' | '午後' | '夜'
    candidate: SlotCandidate | null
  }[] = [
    { key: 'morning', label: '午前', candidate: morningCandidate },
    { key: 'afternoon', label: '午後', candidate: afternoonCandidate },
    { key: 'evening', label: '夜', candidate: eveningCandidate },
  ]

  const results: PrivateBookingSlot[] = []

  for (const def of slotDefs) {
    if (!def.candidate) continue

    // Weekday exclusion
    if (!isWeekendOrHoliday) {
      if (def.key === 'afternoon' && weekdayMorningOnly) continue
      if (def.key === 'morning' && !weekdayMorningOnly) continue
    }

    let startMinutes: number
    let effectiveSlotEndLimit = def.candidate.slotEnd

    if (def.key === 'evening') {
      const configuredStart = def.candidate.slotBaselineStart
      const reverseCalculatedStart = HARD_DAY_LIMIT - durationMinutes
      const hasEarlierEvent = def.candidate.earliestStart > configuredStart

      if (hasEarlierEvent) {
        startMinutes = def.candidate.earliestStart
      } else if (configuredStart + durationMinutes <= HARD_DAY_LIMIT) {
        startMinutes = configuredStart
      } else {
        startMinutes = reverseCalculatedStart
      }

      if (startMinutes + durationMinutes > HARD_DAY_LIMIT) continue
    } else if (
      !isWeekendOrHoliday &&
      (def.key === 'morning' || def.key === 'afternoon')
    ) {
      const eveningBaseStart = eveningCandidate?.slotBaselineStart ?? 19 * 60
      const eveningDeadline =
        eveningBaseStart - PRIVATE_BOOKING_EVENT_INTERVAL_MINUTES
      const reverseFromEvening =
        eveningDeadline - durationMinutes - extraPrepTime
      const priorFloor = def.candidate.priorEventEarliestStartMin

      if (weekdayMorningOnly) {
        startMinutes = Math.max(def.candidate.slotBaselineStart, priorFloor)
        if (startMinutes + durationMinutes + extraPrepTime > HARD_DAY_LIMIT) {
          continue
        }
        effectiveSlotEndLimit = HARD_DAY_LIMIT
      } else {
        startMinutes = Math.max(def.candidate.slotBaselineStart, priorFloor)
        if (startMinutes + durationMinutes + extraPrepTime > eveningDeadline) {
          continue
        }
      }
    } else {
      startMinutes = def.candidate.earliestStart
    }

    const endMinutes = startMinutes + durationMinutes
    if (startMinutes >= effectiveSlotEndLimit) continue
    if (endMinutes > HARD_DAY_LIMIT) continue

    // Boundary extension: end exceeds slot limit but may still fit in the day
    if (endMinutes > effectiveSlotEndLimit) {
      let nextEventStart: number | null = null
      for (const ev of allStoreEvents) {
        const evDate = ev.date ? String(ev.date).split('T')[0] : ''
        if (evDate !== targetDate) continue
        const sid = ev.store_id ?? ev.stores?.id ?? null
        if (!sid || !storeIds.includes(sid)) continue
        if (!ev.start_time) continue
        const evStart = timeStrToMinutes(String(ev.start_time))
        if (evStart !== null && evStart > startMinutes) {
          if (nextEventStart === null || evStart < nextEventStart) {
            nextEventStart = evStart
          }
        }
      }

      const bufferNeeded = 60 + extraPrepTime
      const effectiveEndLimit =
        nextEventStart !== null
          ? nextEventStart - bufferNeeded
          : HARD_DAY_LIMIT - extraPrepTime

      if (endMinutes > effectiveEndLimit) continue
    }

    results.push({
      key: def.key,
      label: def.label,
      startTime: minutesToTime(startMinutes),
      endTime: minutesToTime(endMinutes),
    })
  }

  const filtered = results.filter((slot) =>
    isPrivateBookingSlotAllowedByScenarioSettings(
      slot.label,
      privateBookingTimeSlots,
    ),
  )

  // 午後と夜が重複する場合は午後を除外
  // （週末に午後スロットが夜スロットの開始時刻をまたぐケースへの対処）
  const eveningSlot = filtered.find(s => s.key === 'evening')
  if (eveningSlot) {
    const eveningStartMin = timeStrToMinutes(eveningSlot.startTime) ?? (19 * 60)
    return filtered.filter(s => {
      if (s.key !== 'afternoon') return true
      const afternoonEndMin = timeStrToMinutes(s.endTime) ?? 0
      return afternoonEndMin + PRIVATE_BOOKING_EVENT_INTERVAL_MINUTES <= eveningStartMin
    })
  }

  return filtered
}

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
    } else if (slotKey === 'afternoon') {
      // 午後: configured start (14:00) で開始すると次予約に干渉する場合のみ
      // 「次予約 - 60min - duration」から逆算して前倒し開始する
      const configuredStart = f.minAllowedStart
      const configuredEnd = configuredStart + durationMinutes + extraPrepTime
      let endLimitFromNextEvent = f.slotBandEnd
      for (const ev of allStoreEvents) {
        const ed = ev.date ? String(ev.date).split('T')[0] : ''
        if (ed !== targetDate) continue
        const sid = ev.store_id ?? ev.stores?.id ?? null
        if (sid !== storeId) continue
        if (!ev.start_time) continue
        const eStart = timeStrToMinutes(String(ev.start_time))
        if (eStart === null) continue
        if (eStart < f.slotBandStart) continue
        const candidate = eStart - PRIVATE_BOOKING_EVENT_INTERVAL_MINUTES
        if (candidate < endLimitFromNextEvent) endLimitFromNextEvent = candidate
      }
      if (configuredEnd > endLimitFromNextEvent) {
        const reverseStart = endLimitFromNextEvent - durationMinutes - extraPrepTime
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
        // 逆算結果が「午後帯の開始 (slotBandStart, 通常 14:00)」より早い = 実質午前帯のため
        // この店舗は午後候補として push しない (午前スロットと重複表示する原因になる)
        if (startForFeasibility < f.slotBandStart) {
          continue
        }
        // 逆算した開始でも次予約までに本編 + 準備時間が収まらなければ枠不成立。
        // 例: 朝公演 09:00-13:00 (+60分バッファで 14:00 まで) があり、午後公演が 14:00 開始の場合、
        // 逆算開始は 14:00 になるが 14:00 から 150分 走ると次予約と直接 collide する。
        if (
          startForFeasibility + durationMinutes + extraPrepTime > endLimitFromNextEvent
        ) {
          continue
        }
      } else {
        startForFeasibility = configuredStart
      }
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
    //
    // 複数店舗選択時は「いずれか 1 店舗でも収まればOK」(OR判定) にする必要がある。
    // 各店舗ごとに「自店で startMinutes 以降の最早イベント」を集めて、
    // - イベント無しの店舗が 1 つでもあれば → 制約なし (HARD_DAY_LIMIT - extraPrep)
    // - 全店イベントあり → 各店の最早 next event のうち「最も後ろ」の店舗で判定
    //   (どこかでは収まる、を取る)
    if (endMinutes > effectiveSlotEndLimit) {
      let anyStoreWithoutNext = false
      let bestNextEventStart: number | null = null
      for (const storeId of storeIds) {
        let storeNextEventStart: number | null = null
        for (const ev of allStoreEvents) {
          const evDate = ev.date ? String(ev.date).split('T')[0] : ''
          if (evDate !== targetDate) continue
          const sid = ev.store_id ?? ev.stores?.id ?? null
          if (sid !== storeId) continue
          if (!ev.start_time) continue
          const evStart = timeStrToMinutes(String(ev.start_time))
          if (evStart !== null && evStart > startMinutes) {
            if (storeNextEventStart === null || evStart < storeNextEventStart) {
              storeNextEventStart = evStart
            }
          }
        }
        if (storeNextEventStart === null) {
          anyStoreWithoutNext = true
          break
        }
        if (bestNextEventStart === null || storeNextEventStart > bestNextEventStart) {
          bestNextEventStart = storeNextEventStart
        }
      }

      const bufferNeeded = 60 + extraPrepTime
      const effectiveEndLimit = anyStoreWithoutNext
        ? HARD_DAY_LIMIT - extraPrepTime
        : (bestNextEventStart ?? HARD_DAY_LIMIT) - bufferNeeded

      if (endMinutes > effectiveEndLimit) continue
    }

    results.push({
      key: def.key,
      label: def.label,
      startTime: minutesToTime(startMinutes),
      endTime: minutesToTime(endMinutes),
    })
  }

  // 同じ時刻のスロットが複数あったら優先度の高い方 (夜 > 午後 > 午前) を残す。
  // 夜が逆算で 18:30 になり、午後候補も同じ前提で 18:30 に押し出された結果、
  // 「午後」と「夜」が同じ時刻で重複表示されるケースを潰す。
  const slotPriority: Record<SlotKey, number> = { morning: 1, afternoon: 2, evening: 3 }
  const dedupedByTime = new Map<string, PrivateBookingSlot>()
  for (const slot of results) {
    const key = `${slot.startTime}-${slot.endTime}`
    const existing = dedupedByTime.get(key)
    if (!existing || slotPriority[slot.key] > slotPriority[existing.key]) {
      dedupedByTime.set(key, slot)
    }
  }

  return Array.from(dedupedByTime.values()).filter((slot) =>
    isPrivateBookingSlotAllowedByScenarioSettings(
      slot.label,
      privateBookingTimeSlots,
    ),
  )
}

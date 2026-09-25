/**
 * 貸切の「この店・この日・この枠（朝/昼/夜）で何時から入れそうか」
 *
 * 設定画面の business_hours_settings を getPerStoreSlotsForDate で解釈し、
 * 同日の schedule_events との重なり（終了+1h バッファ）で最早開始を求める。
 * シナリオ詳細の枠表示・クリック可否・グループ候補追加で同じ結果になるよう共通化する。
 */

import {
  getPerStoreSlotsForDate,
  type BusinessHoursSettingRow,
} from '@/lib/privateGroupCandidateSlots'
import { PRIVATE_BOOKING_EVENT_INTERVAL_MINUTES } from '@/lib/privateBookingScenarioTime'

export type PrivateBookingSlotKey = 'morning' | 'afternoon' | 'evening'

export type PrivateBookingStoreSlotFeasibility = {
  /** 営業枠の開始（分） */
  preparationMinutes?: number
  slotBandStart: number
  /** 営業枠の終了（分） */
  slotBandEnd: number
  /** 既存公演を踏まえた最早開始（分） */
  minAllowedStart: number
  /**
   * 枠と重なる公演の「終了+1hバッファ」までの分。公演がなければ 0。
   * 平日昼の「終了から逆算した開始」では営業枠の下限は使わず、この値だけを下限にする。
   */
  priorEventEarliestStartMin: number
}

type EventWithStore = {
  preparation_minutes?: number
  start_time?: string | null
  end_time?: string | null
  date?: string | null
  store_id?: string | null
  stores?: { id?: string | null } | null
}

function timeToMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number)
  return h * 60 + (m || 0)
}

/** 対象日の午前0時を基準に、前後日の公演も同じ分単位へ揃える。 */
function eventInterval(e: EventWithStore, targetDate: string): { start: number; end: number } | null {
  if (!e.date || !e.start_time) return null
  const date = String(e.date).split('T')[0]
  const offset = (Date.parse(`${date}T00:00:00+09:00`) - Date.parse(`${targetDate}T00:00:00+09:00`)) / 60000
  if (!Number.isFinite(offset)) return null
  const start = timeToMinutes(e.start_time)
  let end = e.end_time ? timeToMinutes(e.end_time) : start + 240
  if (end < start) end += 1440
  return { start: offset + start, end: offset + end }
}

function eventStoreId(e: EventWithStore): string | null {
  if (e.store_id) return e.store_id
  if (e.stores?.id) return e.stores.id
  return null
}

/**
 * 店舗がその日その枠を持たない・休業なら null
 */
export function getPrivateBookingStoreSlotFeasibility(
  targetDateYmd: string,
  storeId: string,
  slotKey: PrivateBookingSlotKey,
  row: BusinessHoursSettingRow | undefined,
  allEvents: EventWithStore[],
  isCustomHoliday: (d: string) => boolean,
  allowSyntheticWhenMissingRow: boolean,
  preparationMinutes: number = PRIVATE_BOOKING_EVENT_INTERVAL_MINUTES
): PrivateBookingStoreSlotFeasibility | null {
  const perSlots = getPerStoreSlotsForDate(targetDateYmd, row, isCustomHoliday, {
    allowSyntheticWhenMissingRow,
  })
  if (!perSlots) return null
  const bounds = perSlots.find((s) => s.key === slotKey)
  if (!bounds) return null

  const slotBandStart = bounds.startMin
  const slotBandEnd = bounds.endMin

  const intervals = allEvents.filter(e => eventStoreId(e) === storeId)
    .map(e => eventInterval(e, targetDateYmd))
    .filter((interval): interval is {start: number; end: number} => interval !== null)
    .sort((a,b) => a.start-b.start)
  let latestEventEnd = 0
  for (const interval of intervals) {
    const eventEndWithBuffer = interval.end + preparationMinutes
    if (interval.start <= Math.max(slotBandStart, latestEventEnd) && eventEndWithBuffer > slotBandStart) {
      latestEventEnd = Math.max(latestEventEnd, eventEndWithBuffer)
    }
  }

  const minAllowedStart =
    latestEventEnd > 0 ? Math.max(slotBandStart, latestEventEnd) : slotBandStart
  return {
    preparationMinutes,
    slotBandStart,
    slotBandEnd,
    minAllowedStart,
    priorEventEarliestStartMin: latestEventEnd,
  }
}

/** 同日・同店の公演一覧（start_time で次枠とのデッドラインを計算する） */
export type PrivateBookingFeasibilityEventContext = {
  targetDateYmd: string
  storeId: string
  dayEvents: EventWithStore[]
}

/** 1日の最終時刻（23:00）。長時間作品が枠境界を超える場合の上限 */
export const PRIVATE_BOOKING_DAY_END_MINUTES = 23 * 60

/**
 * 提案開始時刻が営業枠内かつ公演後に収まるか
 * @param effectiveMinStartMin 指定時はこれを最早開始の下限にする（平日昼の逆算表示と整合させる用）
 * @param occupancyEndOverride 長時間作品で枠境界を超える場合に slotBandEnd の代わりに使う上限
 */
export function isProposedPrivateBookingStartFeasible(
  f: PrivateBookingStoreSlotFeasibility,
  proposedStartMin: number,
  durationMinutes: number,
  extraPrepMinutes: number,
  eventCtx?: PrivateBookingFeasibilityEventContext,
  effectiveMinStartMin?: number,
  occupancyEndOverride?: number
): boolean {
  const minStart = effectiveMinStartMin ?? f.minAllowedStart
  if (proposedStartMin < minStart) return false

  let effectiveOccupancyEndLimit = occupancyEndOverride ?? f.slotBandEnd
  if (eventCtx) {
    for (const e of eventCtx.dayEvents) {
      if (eventStoreId(e) !== eventCtx.storeId) continue
      const interval = eventInterval(e, eventCtx.targetDateYmd)
      if (!interval) continue
      const eventStart = interval.start
      const eventEnd = interval.end
      if (eventStart < proposedStartMin &&
          eventEnd + (f.preparationMinutes ?? PRIVATE_BOOKING_EVENT_INTERVAL_MINUTES) > proposedStartMin) {
        return false
      }
      // 提案開始と同時刻にスタートする予約も「直接 collide」として枠を狭める。
      // strict > にしていると、たとえば 14:00 に既存予約があるとき 14:00 開始を許してしまう。
      if (eventStart >= proposedStartMin) {
        effectiveOccupancyEndLimit = Math.min(
          effectiveOccupancyEndLimit,
          eventStart - (e.preparation_minutes ?? PRIVATE_BOOKING_EVENT_INTERVAL_MINUTES)
        )
      }
    }
  }

  if (proposedStartMin + durationMinutes + extraPrepMinutes > effectiveOccupancyEndLimit) {
    return false
  }
  return true
}

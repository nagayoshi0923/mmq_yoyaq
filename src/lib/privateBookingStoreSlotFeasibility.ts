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
  allowSyntheticWhenMissingRow: boolean
): PrivateBookingStoreSlotFeasibility | null {
  const perSlots = getPerStoreSlotsForDate(targetDateYmd, row, isCustomHoliday, {
    allowSyntheticWhenMissingRow,
  })
  if (!perSlots) return null
  const bounds = perSlots.find((s) => s.key === slotKey)
  if (!bounds) return null

  const slotBandStart = bounds.startMin
  const slotBandEnd = bounds.endMin

  const dayEvents = allEvents.filter((e) => {
    const ed = e.date ? String(e.date).split('T')[0] : ''
    if (ed !== targetDateYmd) return false
    return eventStoreId(e) === storeId
  })

  let latestEventEnd = 0
  for (const e of dayEvents) {
    const st = e.start_time || ''
    if (!st) continue
    const eventStart = timeToMinutes(st)
    const eventEnd = e.end_time ? timeToMinutes(e.end_time) : eventStart + 240
    const eventEndWithBuffer = eventEnd + 60
    if (eventStart < slotBandEnd && eventEndWithBuffer > slotBandStart) {
      if (eventEndWithBuffer > latestEventEnd) latestEventEnd = eventEndWithBuffer
    }
  }

  const minAllowedStart =
    latestEventEnd > 0 ? Math.max(slotBandStart, latestEventEnd) : slotBandStart
  return {
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
      const ed = e.date ? String(e.date).split('T')[0] : ''
      if (ed !== eventCtx.targetDateYmd) continue
      if (eventStoreId(e) !== eventCtx.storeId) continue
      const st = e.start_time || ''
      if (!st) continue
      const eventStart = timeToMinutes(st)
      if (eventStart > proposedStartMin) {
        effectiveOccupancyEndLimit = Math.min(
          effectiveOccupancyEndLimit,
          eventStart - PRIVATE_BOOKING_EVENT_INTERVAL_MINUTES
        )
      }
    }
  }

  if (proposedStartMin + durationMinutes + extraPrepMinutes > effectiveOccupancyEndLimit) {
    return false
  }
  return true
}

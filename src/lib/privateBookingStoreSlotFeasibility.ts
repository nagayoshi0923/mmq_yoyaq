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

export type PrivateBookingSlotKey = 'morning' | 'afternoon' | 'evening'

export type PrivateBookingStoreSlotFeasibility = {
  /** 営業枠の開始（分） */
  slotBandStart: number
  /** 営業枠の終了（分） */
  slotBandEnd: number
  /** 既存公演を踏まえた最早開始（分） */
  minAllowedStart: number
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
  return { slotBandStart, slotBandEnd, minAllowedStart }
}

/** 提案開始時刻が営業枠内かつ公演後に収まるか */
export function isProposedPrivateBookingStartFeasible(
  f: PrivateBookingStoreSlotFeasibility,
  proposedStartMin: number,
  durationMinutes: number,
  extraPrepMinutes: number
): boolean {
  if (proposedStartMin < f.minAllowedStart) return false
  if (proposedStartMin + durationMinutes + extraPrepMinutes > f.slotBandEnd) return false
  return true
}

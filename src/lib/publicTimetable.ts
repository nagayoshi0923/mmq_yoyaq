/**
 * 店舗トップ「リスト」「カレンダー（選んだ日）」の時間割（店舗 × 朝／昼／夜）。
 * 公演は PublicPerformance、貸切で埋まった枠は公開ビューの貸切公演（中身は出さず「貸切」とだけ見せる）。
 */
import { startTimeToEn, type TimeSlotEn } from '@/lib/timeSlot'
import type { PublicPerformance } from '@/lib/publicPerformanceSearch'

export const TIMETABLE_SLOTS: { key: TimeSlotEn; label: string }[] = [
  { key: 'morning', label: '朝' },
  { key: 'afternoon', label: '昼' },
  { key: 'evening', label: '夜' },
]

export type TimetableCell =
  | { kind: 'performance'; performance: PublicPerformance }
  | { kind: 'private' }

export interface TimetableRow {
  store_id: string
  label: string
  slots: Record<TimeSlotEn, TimetableCell[]>
}

export interface TimetableDay {
  date: string
  rows: TimetableRow[]
  /** 公演も貸切も無く畳んだ店舗の数 */
  hidden_store_count: number
  total: number
  /** 人数分の空席がある公演数 */
  open: number
}

export interface PrivateBlock {
  store_id: string | null
  date: string
  start_time: string | null
}

function emptySlots(): Record<TimeSlotEn, TimetableCell[]> {
  return { morning: [], afternoon: [], evening: [] }
}

/**
 * 1 日分の時間割。stores の並び（店舗の表示順）で行を作り、公演のある臨時会場などは後ろに足す。
 * 公演も貸切も無い店舗の行は畳んで数だけ返す。
 */
export function buildTimetableDay(
  date: string,
  performances: readonly PublicPerformance[],
  privateBlocks: readonly PrivateBlock[],
  stores: readonly { id: string; label: string }[],
  people: number,
): TimetableDay {
  const rows = new Map<string, TimetableRow>()
  for (const s of stores) rows.set(s.id, { store_id: s.id, label: s.label, slots: emptySlots() })
  const dayPerformances = performances
    .filter((p) => p.date === date && p.store_id)
    .sort((a, b) => a.start_time.localeCompare(b.start_time))
  for (const p of dayPerformances) {
    const id = p.store_id as string
    if (!rows.has(id)) rows.set(id, { store_id: id, label: p.store_name, slots: emptySlots() })
    rows.get(id)!.slots[startTimeToEn(p.start_time)].push({ kind: 'performance', performance: p })
  }
  for (const b of privateBlocks) {
    if (b.date !== date || !b.store_id || !rows.has(b.store_id)) continue
    rows.get(b.store_id)!.slots[startTimeToEn(b.start_time)].push({ kind: 'private' })
  }
  const all = [...rows.values()]
  const shown = all.filter((r) => TIMETABLE_SLOTS.some((s) => r.slots[s.key].length > 0))
  return {
    date,
    rows: shown,
    hidden_store_count: all.length - shown.length,
    total: dayPerformances.length,
    open: dayPerformances.filter((p) => p.available_seats >= people).length,
  }
}

/** 残席の色: 残 3 以上は緑、残 2 以下は赤、満席は灰 */
export function timetableSeatTone(availableSeats: number): 'open' | 'few' | 'full' {
  if (availableSeats <= 0) return 'full'
  if (availableSeats <= 2) return 'few'
  return 'open'
}

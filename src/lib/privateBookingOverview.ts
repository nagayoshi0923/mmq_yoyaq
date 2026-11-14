/**
 * 作品ページの貸切タブで「いつ空いているか」を一目で出すための集計（段階1、2026-11-14 QW-20261114-001）。
 * 空き判定はしない。DB（private_booking_candidate_slot_availability）の結果を、近い順の一覧・月ごとの数・
 * 選べない枠の代わりの候補に並べ替えるだけ。
 * 仕様の正本: docs/product-spec/貸切受付ルール.md。変更時は同じ PR で更新。
 */
import { isJapaneseHoliday } from '@/utils/japaneseHolidays'
import type { PrivateBookingSlot } from '@/lib/computePrivateBookingSlots'
import { availableSlotsForDate, type CandidateSlotAvailability } from '@/lib/candidateSlotAvailability'

export type OverviewSlotFilter = 'all' | PrivateBookingSlot['label']
export interface PrivateBookingOverviewFilter {
  /** 土日祝（祝日・組織の独自休日を含む）だけ */
  weekendOnly: boolean
  /** 時間帯 */
  slot: OverviewSlotFilter
}

export const DEFAULT_OVERVIEW_FILTER: PrivateBookingOverviewFilter = { weekendOnly: false, slot: 'all' }

export interface OpenSlot {
  date: string
  slot: PrivateBookingSlot
}

const SLOT_ORDER: Record<PrivateBookingSlot['label'], number> = { '午前': 0, '午後': 1, '夜': 2 }

/** 土日・祝日・組織の独自休日か（料金・枠表の色分けと同じ考え方。判定には使わない） */
export function isWeekendLike(date: string, isCustomHoliday?: (date: string) => boolean): boolean {
  const dow = new Date(`${date}T00:00:00+09:00`).getUTCDay()
  // JST の曜日（+09:00 の 0 時は UTC の前日 15 時なので UTC 曜日に 1 を足す）
  const jstDow = (dow + 1) % 7
  return jstDow === 0 || jstDow === 6 || isJapaneseHoliday(date) || !!isCustomHoliday?.(date)
}

/** 日付が絞り込みに合うか（曜日だけ。時間帯は枠ごと） */
export function dateMatchesFilter(date: string, filter: PrivateBookingOverviewFilter, isCustomHoliday?: (date: string) => boolean): boolean {
  return !filter.weekendOnly || isWeekendLike(date, isCustomHoliday)
}

/** 選べる枠を日付・時間帯の順に並べる（絞り込み付き） */
export function listOpenSlots(
  availability: CandidateSlotAvailability,
  filter: PrivateBookingOverviewFilter = DEFAULT_OVERVIEW_FILTER,
  isCustomHoliday?: (date: string) => boolean,
): OpenSlot[] {
  const out: OpenSlot[] = []
  for (const date of Object.keys(availability.slotsByDate).sort()) {
    if (!dateMatchesFilter(date, filter, isCustomHoliday)) continue
    for (const slot of availableSlotsForDate(availability, date)) {
      if (filter.slot !== 'all' && slot.label !== filter.slot) continue
      out.push({ date, slot })
    }
  }
  return out.sort((a, b) => a.date.localeCompare(b.date) || SLOT_ORDER[a.slot.label] - SLOT_ORDER[b.slot.label])
}

export interface MonthCount {
  /** YYYY-MM */
  ym: string
  year: number
  month: number
  count: number
}

/** 月ごとの選べる枠の数。from〜to の月はすべて出す（0 枠の月も） */
export function countOpenSlotsByMonth(openSlots: OpenSlot[], fromYmd: string, toYmd: string): MonthCount[] {
  const counts = new Map<string, number>()
  for (const s of openSlots) counts.set(s.date.slice(0, 7), (counts.get(s.date.slice(0, 7)) ?? 0) + 1)
  const out: MonthCount[] = []
  let [y, m] = fromYmd.slice(0, 7).split('-').map(Number)
  const [ty, tm] = toYmd.slice(0, 7).split('-').map(Number)
  while (y < ty || (y === ty && m <= tm)) {
    const ym = `${y}-${String(m).padStart(2, '0')}`
    out.push({ ym, year: y, month: m, count: counts.get(ym) ?? 0 })
    m += 1
    if (m > 12) { m = 1; y += 1 }
  }
  return out
}

function dayDistance(a: string, b: string): number {
  return Math.abs((Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / 86_400_000)
}

/**
 * 選べない枠を押したときに出す代わりの候補。同じ日の別の時間帯を先に、そのあと日付の近い順（同じ時間帯を優先）。
 * openSlots は絞り込み前の選べる枠。
 */
export function nearbyAlternatives(openSlots: OpenSlot[], date: string, label: PrivateBookingSlot['label'], limit = 3): OpenSlot[] {
  const sameDay = openSlots.filter(s => s.date === date && s.slot.label !== label)
  const others = openSlots
    .filter(s => s.date !== date)
    .sort((a, b) =>
      dayDistance(a.date, date) - dayDistance(b.date, date)
      || Number(a.slot.label !== label) - Number(b.slot.label !== label)
      || a.date.localeCompare(b.date)
      || SLOT_ORDER[a.slot.label] - SLOT_ORDER[b.slot.label])
  return [...sameDay, ...others].slice(0, limit)
}

/** 日付の範囲を DB の上限（62 日）に収まる区間に分ける */
export function splitDateRange(fromYmd: string, toYmd: string, maxDays = 60): Array<{ from: string; to: string }> {
  const out: Array<{ from: string; to: string }> = []
  if (fromYmd > toYmd) return out
  let start = Date.parse(`${fromYmd}T00:00:00Z`)
  const end = Date.parse(`${toYmd}T00:00:00Z`)
  while (start <= end) {
    const chunkEnd = Math.min(end, start + (maxDays - 1) * 86_400_000)
    out.push({ from: new Date(start).toISOString().slice(0, 10), to: new Date(chunkEnd).toISOString().slice(0, 10) })
    start = chunkEnd + 86_400_000
  }
  return out
}

const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土']
/** 「11/28(土)」 */
export function formatMonthDayWeekday(date: string): string {
  const [, m, d] = date.split('-').map(Number)
  const dow = (new Date(`${date}T00:00:00+09:00`).getUTCDay() + 1) % 7
  return `${m}/${d}(${WEEKDAYS[dow]})`
}

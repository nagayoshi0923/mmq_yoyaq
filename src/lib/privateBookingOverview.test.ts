import { describe, expect, it, vi } from 'vitest'
vi.mock('@/lib/supabase', () => ({ supabase: {} }))
import {
  countOpenSlotsByMonth,
  formatMonthDayWeekday,
  isWeekendLike,
  listOpenSlots,
  nearbyAlternatives,
  splitDateRange,
} from './privateBookingOverview'
import type { CandidateSlotAvailability } from './candidateSlotAvailability'

const s = (key: 'morning' | 'afternoon' | 'evening', label: '午前' | '午後' | '夜', startTime: string) => ({ key, label, startTime, endTime: '23:00' })
const availability: CandidateSlotAvailability = {
  slotsByDate: {
    '2026-11-27': [s('morning', '午前', '10:00'), s('afternoon', '午後', '13:00'), s('evening', '夜', '19:00')], // 金
    '2026-11-28': [s('morning', '午前', '09:00'), s('afternoon', '午後', '14:00'), s('evening', '夜', '19:00')], // 土
    '2026-12-05': [s('afternoon', '午後', '14:00')], // 土
    '2026-12-07': [s('evening', '夜', '19:00')], // 月
  },
  unavailableReasons: {
    '2026-11-27-午前': '受付締切を過ぎています',
    '2026-11-27-午後': '他の公演と重なります',
    '2026-11-27-夜': '他の公演と重なります',
    '2026-11-28-午前': '他の公演と重なります',
    '2026-11-28-午後': '他の公演と重なります',
  },
}

describe('privateBookingOverview', () => {
  it('選べる枠だけを日付・時間帯の順に並べる', () => {
    expect(listOpenSlots(availability).map(o => `${o.date} ${o.slot.label}`)).toEqual([
      '2026-11-28 夜', '2026-12-05 午後', '2026-12-07 夜',
    ])
  })

  it('土日祝だけ・時間帯で絞り込む（独自休日も土日祝の扱い）', () => {
    expect(listOpenSlots(availability, { weekendOnly: true, slot: 'all' }).map(o => o.date)).toEqual(['2026-11-28', '2026-12-05'])
    expect(listOpenSlots(availability, { weekendOnly: false, slot: '夜' }).map(o => o.date)).toEqual(['2026-11-28', '2026-12-07'])
    expect(listOpenSlots(availability, { weekendOnly: true, slot: 'all' }, d => d === '2026-12-07').map(o => o.date))
      .toEqual(['2026-11-28', '2026-12-05', '2026-12-07'])
  })

  it('月ごとの数は空きのない月も 0 で出す', () => {
    expect(countOpenSlotsByMonth(listOpenSlots(availability), '2026-11-14', '2027-01-31').map(m => `${m.month}:${m.count}`))
      .toEqual(['11:1', '12:2', '1:0'])
  })

  it('代わりの候補は同じ日の別の時間帯を先に、そのあと近い日（同じ時間帯を優先）', () => {
    const open = listOpenSlots(availability)
    expect(nearbyAlternatives(open, '2026-11-28', '午後').map(o => `${o.date} ${o.slot.label}`))
      .toEqual(['2026-11-28 夜', '2026-12-05 午後', '2026-12-07 夜'])
    expect(nearbyAlternatives(open, '2026-12-06', '夜', 2).map(o => `${o.date} ${o.slot.label}`))
      .toEqual(['2026-12-07 夜', '2026-12-05 午後'])
  })

  it('日付の範囲を 60 日以内に分ける（DB は 62 日まで）', () => {
    const chunks = splitDateRange('2026-11-14', '2027-05-13')
    expect(chunks[0]).toEqual({ from: '2026-11-14', to: '2027-01-12' })
    expect(chunks[chunks.length - 1].to).toBe('2027-05-13')
    expect(chunks.every(c => (Date.parse(c.to) - Date.parse(c.from)) / 86_400_000 <= 61)).toBe(true)
    expect(splitDateRange('2026-11-15', '2026-11-14')).toEqual([])
  })

  it('曜日は日本時間で出す', () => {
    expect(formatMonthDayWeekday('2026-11-28')).toBe('11/28(土)')
    expect(isWeekendLike('2026-11-27')).toBe(false)
    expect(isWeekendLike('2026-11-23')).toBe(true) // 勤労感謝の日
  })
})

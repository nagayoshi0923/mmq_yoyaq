import { describe, expect, it } from 'vitest'
import { keepPickedCandidates, keepSelectedSlots, removedSelectionMessage } from './keepSelectionOnRefetch'
import type { PrivateBookingSlot } from './computePrivateBookingSlots'

const slot = (key: PrivateBookingSlot['key'], startTime: string, endTime: string): PrivateBookingSlot =>
  ({ key, label: key === 'morning' ? '午前' : key === 'afternoon' ? '午後' : '夜', startTime, endTime })

describe('keepSelectedSlots（候補日カレンダーの選択を読み直しで消さない）', () => {
  const selected = [
    { date: '2026-11-10', slot: slot('afternoon', '13:00', '16:30') },
    { date: '2026-11-10', slot: slot('evening', '19:00', '22:30') },
    { date: '2026-12-01', slot: slot('afternoon', '13:00', '16:30') },
  ]
  it('変わっていなければ選択はそのまま（同じ中身・changed=false）', () => {
    const r = keepSelectedSlots(selected, {
      slotsByDate: { '2026-11-10': [slot('afternoon', '13:00', '16:30'), slot('evening', '19:00', '22:30')] },
      unavailableReasons: {},
    })
    expect(r.changed).toBe(false)
    expect(r.next).toEqual(selected)
    expect(r.removed).toEqual([])
  })
  it('選べなくなった枠だけ理由付きで外し、時刻が変わった枠は DB の時刻にそろえ、読み直していない月の枠は残す', () => {
    const r = keepSelectedSlots(selected, {
      slotsByDate: { '2026-11-10': [slot('afternoon', '13:30', '17:00'), slot('evening', '', '')] },
      unavailableReasons: { '2026-11-10-夜': '他の公演と重なります' },
    })
    expect(r.changed).toBe(true)
    expect(r.next.map(s => [s.date, s.slot.label, s.slot.startTime, s.slot.endTime])).toEqual([
      ['2026-11-10', '午後', '13:30', '17:00'],
      ['2026-12-01', '午後', '13:00', '16:30'],
    ])
    expect(r.removed).toEqual([{ label: '11/10 夜', reason: '他の公演と重なります' }])
    expect(removedSelectionMessage(r.removed)).toBe('選べなくなった候補を外しました: 11/10 夜（他の公演と重なります）')
  })
})

describe('keepPickedCandidates（申込シートの選択と優先順を読み直しで消さない）', () => {
  const candidates = [{ id: 'a', label: '11/10(火) 午後 13:00〜16:30' }, { id: 'c', label: '11/12(木) 夜 19:00〜22:30' }]
  it('消えた・選べなくなった候補だけを外し、残りの優先順は変えない', () => {
    const r = keepPickedCandidates(['c', 'b', 'a'], candidates, id => (id === 'a' ? '受付停止中' : null), new Map([['b', '11/11(水) 午前 10:00〜13:30']]))
    expect(r.next).toEqual(['c'])
    expect(r.removed).toEqual([
      { label: '11/11(水) 午前 10:00〜13:30', reason: '候補日が取り下げられたか、店舗が見送りました' },
      { label: '11/10(火) 午後 13:00〜16:30', reason: '受付停止中' },
    ])
  })
  it('何も変わらなければ同じ並び', () => {
    expect(keepPickedCandidates(['c', 'a'], candidates, () => null)).toEqual({ next: ['c', 'a'], removed: [] })
  })
})

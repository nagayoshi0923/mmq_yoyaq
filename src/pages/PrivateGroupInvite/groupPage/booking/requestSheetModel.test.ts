import { describe, expect, it, vi } from 'vitest'
vi.mock('@/lib/supabase', () => ({ supabase: {} }))
import type { PrivateGroup } from '@/types'
import { buildAnswerTable } from '../groupPageModel'
import {
  availabilityWindows, candidateBlockedReason, defaultParticipants, initialPicks, movePick, participantsNote, sheetCandidates,
  slotKeyOf, storeChips, storesToSend, togglePick, toStoreAvailability,
} from './requestSheetModel'

const member = (id: string, extra: Record<string, unknown> = {}) => ({ id, group_id: 'g', user_id: `u-${id}`, guest_name: null, guest_email: null, guest_phone: null, is_organizer: false, status: 'joined', joined_at: null, created_at: '2026-10-01', users: { id: `u-${id}`, email: `${id}@x`, nickname: id }, ...extra })
const cand = (id: string, date: string, slot: string, start: string, end: string, responses: Array<[string, 'ok' | 'maybe' | 'ng']>, extra: Record<string, unknown> = {}) => ({
  id, group_id: 'g', date, time_slot: slot, start_time: start, end_time: end, order_num: 1, created_at: '', ...extra,
  responses: responses.map(([m, r]) => ({ id: `${id}-${m}`, group_id: 'g', member_id: m, candidate_date_id: id, response: r, created_at: '', updated_at: '' })),
})

// 見本 RequestSheet.dc.html と同じ 3 人・3 日
const group = {
  members: [member('ichi', { is_organizer: true, users: { id: 'u-ichi', email: 'i@x', nickname: 'いちこ' } }), member('jiro', { users: { id: 'u-jiro', email: 'j@x', nickname: '二郎' } }), member('sabu', { users: { id: 'u-sabu', email: 's@x', nickname: '三郎' } })],
  candidate_dates: [
    cand('c30', '2026-10-30', '午後', '13:00:00', '18:00:00', [['ichi', 'ok'], ['jiro', 'ok'], ['sabu', 'maybe']]),
    cand('c29', '2026-10-29', 'evening', '18:00:00', '23:00:00', [['ichi', 'maybe'], ['jiro', 'ng'], ['sabu', 'ok']]),
    cand('c23', '2026-10-23', '午後', '13:00:00', '18:00:00', [['ichi', 'ok'], ['jiro', 'ok'], ['sabu', 'ok']]),
    cand('cx', '2026-10-20', '午後', '13:00:00', '18:00:00', [['ichi', 'ok'], ['jiro', 'ok'], ['sabu', 'ok']], { status: 'rejected' }),
  ],
} as unknown as PrivateGroup

describe('申込シートの候補日', () => {
  const table = buildAnswerTable(group, 'ichi')
  const list = sheetCandidates(table, group.candidate_dates!)
  it('店舗が見送った日は出さない。日時・集計・補足（全員○／× の人／△ の人）', () => {
    expect(list.map(c => c.id)).toEqual(['c23', 'c29', 'c30'])
    expect(list[0]).toMatchObject({ label: '10/23(金) 午後 13:00〜18:00', tally: '○3', note: '全員参加できる', hasNg: false, slotKey: 'afternoon' })
    expect(list[1]).toMatchObject({ tally: '○1 △1 ×1', note: '二郎さんが×', hasNg: true, slotKey: 'evening' })
    expect(list[2]).toMatchObject({ tally: '○2 △1', note: '三郎さんが△' })
  })
  it('自分は「あなた」、未回答の人も出す', () => {
    const g = { ...group, candidate_dates: [cand('a', '2026-11-01', '午前', '10:00', '14:00', [['jiro', 'ok']]), cand('b', '2026-11-02', '午前', '10:00', '14:00', [['ichi', 'maybe']])] } as unknown as PrivateGroup
    const rows = sheetCandidates(buildAnswerTable(g, 'ichi'), g.candidate_dates!)
    expect(rows[0].note).toBe('あなた・三郎さんが未回答')
    expect(rows[1].note).toBe('あなたが△')
  })
  it('初期値は全員○の日と○が最多の日（○の多い順）。空きの無い日は選ばない', () => {
    expect(initialPicks(list, 3)).toEqual(['c23', 'c30'])
    expect(initialPicks(list, 3, id => id === 'c23')).toEqual(['c30'])
    expect(initialPicks(list.map(c => ({ ...c, ok: 0 })), 3)).toEqual([])
  })
  it('選んだ順＝優先順。外す・上限・並べ替え', () => {
    expect(togglePick(['a'], 'b')).toEqual(['a', 'b'])
    expect(togglePick(['a', 'b'], 'a')).toEqual(['b'])
    expect(togglePick(['a', 'b'], 'c', 2)).toBeNull()
    expect(movePick(['a', 'b', 'c'], 2, 0)).toEqual(['c', 'a', 'b'])
    expect(movePick(['a', 'b', 'c'], 0, 1)).toEqual(['b', 'a', 'c'])
    expect(movePick(['a', 'b'], 0, -1)).toEqual(['a', 'b'])
  })
})

describe('参加人数', () => {
  it('既定は登録メンバー数を作品の人数に収めたもの', () => {
    expect(defaultParticipants(4, 4, 6)).toBe(4)
    expect(defaultParticipants(3, 5, 6)).toBe(5)
    expect(defaultParticipants(8, 4, 6)).toBe(6)
    expect(defaultParticipants(3, null, null)).toBe(3)
  })
  it('注記', () => {
    expect(participantsNote(6, 4)).toBe('登録メンバー 4 名＋当日来る 2 名')
    expect(participantsNote(4, 4)).toBe('登録メンバー 4 名')
    expect(participantsNote(4, 5)).toBe('登録メンバー 5 名より少ない人数です')
  })
})

describe('店舗ごとの空き', () => {
  const row = (date: string, slot: string, available: boolean, reason: string | null = null) => ({ date, time_slot: slot, available, reason, start_time: available ? '13:00' : null, end_time: available ? '18:00' : null }) as never
  const availability = toStoreAvailability({
    taka: [row('2026-10-23', 'afternoon', true), row('2026-10-30', 'afternoon', true)],
    oku: [row('2026-10-23', 'afternoon', true), row('2026-10-30', 'afternoon', false, 'conflict')],
    otsuka: [row('2026-10-23', 'afternoon', false, 'conflict'), row('2026-10-30', 'afternoon', false, 'blocked')],
  })
  const stores = [{ id: 'taka', name: '高田馬場店' }, { id: 'oku', name: '大久保店' }, { id: 'otsuka', name: '大塚店' }]
  const c23 = { id: 'c23', date: '2026-10-23', slotKey: 'afternoon' as const, label: '10/23(金) 午後 13:00〜18:00' }
  const c30 = { id: 'c30', date: '2026-10-30', slotKey: 'afternoon' as const, label: '10/30(金) 午後 13:00〜18:00' }
  it('選んだ日のどれにも空きが無い店舗は灰色。一部だけなら日付を出す', () => {
    const chips = storeChips(stores, [c23, c30] as never, availability)
    expect(chips.map(c => [c.id, c.disabled, c.partialDates])).toEqual([['taka', false, []], ['oku', false, ['10/30(金)']], ['otsuka', true, []]])
    expect(storesToSend(chips, new Set(['taka', 'oku', 'otsuka']))).toEqual(['taka', 'oku'])
    expect(storesToSend(chips, new Set(['oku']))).toEqual(['oku'])
  })
  it('標準の時刻では入らずずらされ、候補日の開始時刻と違えば空きなし（標準で入るなら空きあり）', () => {
    const a = toStoreAvailability({ taka: [{ date: '2026-10-31', time_slot: 'afternoon', available: true, reason: null, start_time: '18:00', end_time: '21:30', adjusted: true } as never] })
    const c31 = { date: '2026-10-31', slotKey: 'afternoon' as const, startTime: '13:00' }
    expect(candidateBlockedReason(a, ['taka'], c31)).toBe('この時刻は空きがありません（18:00 開始なら空きあり）')
    expect(candidateBlockedReason(a, ['taka'], { ...c31, startTime: '18:00' })).toBeNull()
    const std = toStoreAvailability({ taka: [{ date: '2026-10-31', time_slot: 'afternoon', available: true, reason: null, start_time: '14:00', end_time: '17:30', adjusted: false } as never] })
    expect(candidateBlockedReason(std, ['taka'], c31)).toBeNull()
  })
  it('読めていないときは灰色にしない', () => {
    expect(storeChips(stores, [c23] as never, null).every(c => !c.disabled)).toBe(true)
    expect(candidateBlockedReason(null, ['taka'], c23)).toBeNull()
  })
  it('希望店舗のどこにも空きが無い日は理由を返す', () => {
    expect(candidateBlockedReason(availability, ['taka', 'otsuka'], c30)).toBeNull()
    expect(candidateBlockedReason(availability, ['oku', 'otsuka'], c30)).toBe('希望店舗はどこも空きがありません')
    expect(candidateBlockedReason(availability, ['otsuka'], c30)).toBe('受付停止中')
  })
  it('時間帯の書き方をそろえる・読む期間は 60 日ごと', () => {
    expect([slotKeyOf('午前'), slotKeyOf('昼'), slotKeyOf('夜間'), slotKeyOf('x')]).toEqual(['morning', 'afternoon', 'evening', null])
    expect(availabilityWindows(['2026-12-30', '2026-10-01', '2026-10-05', '2026-10-01'])).toEqual([{ from: '2026-10-01', to: '2026-10-05' }, { from: '2026-12-30', to: '2026-12-30' }])
  })
})

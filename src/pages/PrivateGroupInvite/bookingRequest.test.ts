import { describe, expect, it } from 'vitest'
import {
  bookingRequestErrorMessage, buildCandidateDatetimes, findPastDeadlineCandidates, findUnavailableCandidates,
  generateReservationNumber, parseDeadlineDays, pastDeadlineMessage, selectBookableCandidates,
} from './bookingRequest'

const cand = (id: string, date: string, over: Record<string, unknown> = {}) =>
  ({ id, date, time_slot: '夜', start_time: '19:00', end_time: '22:00', status: 'pending', ...over })

describe('貸切グループからの予約リクエストの判断', () => {
  it('選んだ候補から却下済みを除く', () => {
    const list = [cand('a', '2026-11-01'), cand('b', '2026-11-02', { status: 'rejected' }), cand('c', '2026-11-03')]
    expect(selectBookableCandidates(list, new Set(['a', 'b'])).map(c => c.id)).toEqual(['a'])
    expect(selectBookableCandidates(undefined, new Set(['a']))).toEqual([])
  })

  it('締切日数は読めたときだけ使う', () => {
    expect(parseDeadlineDays({ data: 7, error: null })).toBe(7)
    expect(parseDeadlineDays({ data: 0, error: null })).toBe(0)
    expect(parseDeadlineDays({ data: 7, error: { message: 'x' } })).toBeNull()
    expect(parseDeadlineDays({ data: '7', error: null })).toBeNull()
    expect(parseDeadlineDays({ data: -1, error: null })).toBeNull()
  })

  it('受付締切を過ぎた候補を日本時間で判定し、知らせる文を作る（#506）', () => {
    const now = new Date('2026-10-04T15:30:00Z') // 日本時間 10/5 0:30
    const list = [cand('a', '2026-10-11'), cand('b', '2026-10-12'), cand('c', '2026-10-20')]
    const past = findPastDeadlineCandidates(list, 7, now) // 10/12 より前は締切後
    expect(past.map(c => c.id)).toEqual(['a'])
    expect(pastDeadlineMessage(past, 7)).toBe('10/11 は貸切の受付締切（公演日の7日前まで）を過ぎています。この日程を外して申し込んでください')
    expect(findPastDeadlineCandidates(list, null, now)).toEqual([])
  })

  it('どの希望店舗でも既存公演と重なる候補だけを受けられないとする', () => {
    const list = [cand('a', '2026-11-01'), cand('b', '2026-11-02'), cand('x', '2026-11-03', { start_time: 'bad' })]
    const events = [
      { id: 'e1', date: '2026-11-01', store_id: 's1', start_time: '19:00', end_time: '22:00' },
      { id: 'e2', date: '2026-11-01', store_id: 's2', start_time: '18:00', end_time: '21:00' },
      { id: 'e3', date: '2026-11-02', store_id: 's1', start_time: '19:00', end_time: '22:00' },
    ]
    const result = findUnavailableCandidates(list, ['s1', 's2'], [], events, {})
    expect(result.map(c => c.id)).toEqual(['a', 'x']) // b は s2 が空いている。x は時刻が読めない
  })

  it('予約番号は日付とランダム4文字', () => {
    expect(generateReservationNumber(new Date('2026-10-04T03:00:00Z'), () => 0.123456789)).toMatch(/^261004-[0-9A-Z]{4}$/)
  })

  it('保存する候補日時は順番・公演時間の終了・希望店舗を持つ', () => {
    const timing = { duration: 180, weekend_duration: null } as never
    const out = buildCandidateDatetimes([cand('a', '2026-11-04', { start_time: '13:00' })], [{ id: 's1', name: '高田馬場' }], timing, () => false)
    expect(out).toEqual({
      candidates: [{ order: 1, date: '2026-11-04', timeSlot: '夜', startTime: '13:00', endTime: '16:00', status: 'pending' }],
      requestedStores: [{ storeId: 's1', storeName: '高田馬場', storeShortName: '高田馬場' }],
    })
  })

  it('作成の失敗はお客様向けの文にする', () => {
    expect(bookingRequestErrorMessage({ code: 'P0045' })).toBe('貸切の受付締切を過ぎた候補日があります。その日程を外して、もう一度お試しください。')
    expect(bookingRequestErrorMessage({ code: 'P0054' })).toBe('作品の公演期間外の候補日があります。その日程を外して、もう一度お試しください。')
    expect(bookingRequestErrorMessage({ code: 'XX', message: 'slot conflict' })).toBe('候補日時に既存の公演との競合があります。日時と希望店舗を再選択してください。')
    expect(bookingRequestErrorMessage({ code: 'XX', message: '別の失敗' })).toBe('別の失敗')
    expect(bookingRequestErrorMessage({})).toBe('貸切リクエストの送信に失敗しました')
  })
})

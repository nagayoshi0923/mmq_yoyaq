import { describe, expect, it } from 'vitest'
import {
  buildPrivateBookingBlockedSlotIndex,
  classifyPrivateBookingBlockedTiming,
  createPrivateBookingBlockedSlotKey,
  getPrivateBookingCandidateBlockedState,
  privateRecruitmentPauseRows,
  toCanonicalPrivateBookingTimeSlot,
} from './privateBookingBlockedSlotAvailability'

const rows = [
  {
    date: '2026-10-25',
    store_id: 'otsuka',
    time_slot: 'afternoon',
    created_at: '2026-07-11T09:00:00+09:00',
  },
  {
    date: '2026-10-25',
    store_id: 'okubo',
    time_slot: 'afternoon',
    created_at: '2026-07-23T09:00:00+09:00',
  },
]

describe('private booking blocked slot availability', () => {
  it.each([
    ['午前', 'morning'],
    ['朝', 'morning'],
    ['午後', 'afternoon'],
    ['昼', 'afternoon'],
    ['夜間', 'evening'],
    ['夜', 'evening'],
  ] as const)('%s を正規time_slot %sへ変換する', (input, expected) => {
    expect(toCanonicalPrivateBookingTimeSlot(input)).toBe(expected)
  })

  it('不明な時間帯はキーを作らない', () => {
    expect(createPrivateBookingBlockedSlotKey('2026-10-25', 'otsuka', '深夜')).toBeNull()
  })

  it('複数希望店舗の一部だけ停止なら候補を有効のままにする', () => {
    const state = getPrivateBookingCandidateBlockedState(
      { date: '2026-10-25', timeSlot: '午後' },
      ['otsuka', 'takadanobaba'],
      buildPrivateBookingBlockedSlotIndex(rows)
    )
    expect(state).toMatchObject({
      blockedStoreIds: ['otsuka'],
      availableStoreIds: ['takadanobaba'],
      allStoresBlocked: false,
      partiallyBlocked: true,
    })
  })

  it('希望店舗が全て停止なら候補を無効にする', () => {
    const state = getPrivateBookingCandidateBlockedState(
      { date: '2026-10-25', timeSlot: '午後' },
      ['otsuka', 'okubo'],
      rows
    )
    expect(state.allStoresBlocked).toBe(true)
    expect(state.availableStoreIds).toEqual([])
  })

  it('全店舗が申請前から停止済みなら既存不整合に分類する', () => {
    expect(
      classifyPrivateBookingBlockedTiming(
        { date: '2026-10-25', timeSlot: '午後' },
        ['otsuka'],
        rows,
        '2026-07-22T12:00:00+09:00'
      )
    ).toBe('blocked_at_request')
  })

  it('申請後に全店舗が停止した場合を区別する', () => {
    expect(
      classifyPrivateBookingBlockedTiming(
        { date: '2026-10-25', timeSlot: '午後' },
        ['okubo'],
        rows,
        '2026-07-22T12:00:00+09:00'
      )
    ).toBe('blocked_after_request')
  })
})

describe('privateRecruitmentPauseRows（#727 店舗の貸切募集停止を承認画面に出す）', () => {
  const pause = (extra = {}) => ({ store_id: 'store-a', pause_type: 'private' as const, starts_on: '2026-11-19', ends_on: '2026-11-19', ...extra })

  it('停止期間内の候補日は、朝・昼・夜すべてを停止枠にする', () => {
    const result = privateRecruitmentPauseRows([pause()], ['2026-11-18', '2026-11-19', '2026-11-19'])
    expect(result.map(row => `${row.date}:${row.store_id}:${row.time_slot}`)).toEqual([
      '2026-11-19:store-a:morning', '2026-11-19:store-a:afternoon', '2026-11-19:store-a:evening',
    ])
    expect(getPrivateBookingCandidateBlockedState({ date: '2026-11-19', timeSlot: '夜間' }, ['store-a'], result).allStoresBlocked).toBe(true)
    expect(getPrivateBookingCandidateBlockedState({ date: '2026-11-18', timeSlot: '夜間' }, ['store-a'], result).blockedStoreIds).toEqual([])
  })

  it('公演募集停止は貸切の停止に含めない。期限なしの停止は全日を対象にする', () => {
    expect(privateRecruitmentPauseRows([pause({ pause_type: 'performance' })], ['2026-11-19'])).toEqual([])
    expect(privateRecruitmentPauseRows([pause({ starts_on: null, ends_on: null })], ['2030-01-01'])).toHaveLength(3)
  })
})

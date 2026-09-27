import { describe, expect, it } from 'vitest'
import { candidateConflictKey, hasGmTimeConflict, hasStoreTimeConflict, type ConflictEvent } from './privateBookingConflicts'
const settings = { organization: 60, stores: {}, scenarios: {}, performances: {} }
const candidate = { date: '2027-01-03', startTime: '14:00', endTime: '17:00' }
const event: ConflictEvent = { id: 'event', date: '2027-01-03', start_time: '17:30', end_time: '20:30', store_id: 'store', scenario_master_id: 'other' }
describe('貸切候補の実時刻と準備時間', () => {
  it.each([[0, false], [30, false], [60, true]])('組織準備時間%s分を境界まで反映', (minutes, expected) => {
    expect(hasStoreTimeConflict(candidate, event, 'request', 'store', 'scenario', { ...settings, organization: minutes })).toBe(expected)
  })
  it('後の公演の上書きと0を優先し、nullは継承する', () => {
    expect(hasStoreTimeConflict(candidate, event, 'request', 'store', 'scenario', { ...settings, performances: { event: 0 } })).toBe(false)
    expect(hasStoreTimeConflict(candidate, event, 'request', 'store', 'scenario', { ...settings, performances: { event: null } })).toBe(true)
  })
  it('前の公演との間隔には候補作品の準備時間を使う', () => {
    const earlier = { ...event, start_time: '10:00', end_time: '13:30' }
    expect(hasStoreTimeConflict(candidate, earlier, 'request', 'store', 'scenario', { ...settings, scenarios: { scenario: 30 } })).toBe(false)
    expect(hasStoreTimeConflict(candidate, earlier, 'request', 'store', 'scenario', settings)).toBe(true)
  })
  it('同じ午後でも実時間が重複しなければGM競合ではない', () => {
    expect(hasGmTimeConflict(candidate, event, 'request')).toBe(false)
    expect(hasGmTimeConflict({ ...candidate, startTime: '17:00', endTime: '19:00' }, event, 'request')).toBe(true)
  })
  it('前日深夜と自身の再承認を区別する', () => {
    const overnight = { ...event, date: '2027-01-02', start_time: '23:00', end_time: '15:00' }
    expect(hasGmTimeConflict(candidate, overnight, 'request')).toBe(true)
    expect(hasStoreTimeConflict(candidate, { ...overnight, reservation_id: 'request' }, 'request', 'store', 'scenario', settings)).toBe(false)
  })
  it('別申込・別候補の競合キーを混ぜない', () => {
    expect(candidateConflictKey('one', 1, 'store')).not.toBe(candidateConflictKey('two', 1, 'store'))
    expect(candidateConflictKey('one', 1, 'store')).not.toBe(candidateConflictKey('one', 2, 'store'))
  })
  it('欠損した時刻を空きとみなさない', () => {
    expect(() => hasGmTimeConflict(candidate, { ...event, end_time: '' }, 'request')).toThrow()
  })
})

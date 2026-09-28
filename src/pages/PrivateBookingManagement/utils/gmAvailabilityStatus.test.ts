import { describe, expect, it } from 'vitest'
import {
  hasGmResponded,
  isGmAvailableForCandidate,
  isGmMarkedAvailable,
  type GmResponseLike,
} from './gmAvailabilityStatus'

function gm(overrides: Partial<GmResponseLike> = {}): GmResponseLike {
  return { ...overrides }
}

describe('hasGmResponded', () => {
  it('responded_at があれば回答済み', () => {
    expect(hasGmResponded(gm({ responded_at: '2026-07-09T00:00:00Z' }))).toBe(true)
  })
  it('pending / 空は未回答', () => {
    expect(hasGmResponded(gm({ response_status: 'pending' }))).toBe(false)
    expect(hasGmResponded(gm({}))).toBe(false)
  })
  it('旧レコード: status が pending 以外なら回答済み', () => {
    expect(hasGmResponded(gm({ response_status: 'available' }))).toBe(true)
    expect(hasGmResponded(gm({ response_status: 'unavailable' }))).toBe(true)
  })
  it('旧レコード: available_candidates があれば回答済み', () => {
    expect(hasGmResponded(gm({ available_candidates: [0] }))).toBe(true)
  })
})

describe('isGmMarkedAvailable', () => {
  it('unavailable / all_unavailable は対応不可', () => {
    expect(isGmMarkedAvailable(gm({ response_status: 'unavailable' }))).toBe(false)
    expect(isGmMarkedAvailable(gm({ response_status: 'all_unavailable' }))).toBe(false)
  })
  it('available は対応可能', () => {
    expect(isGmMarkedAvailable(gm({ response_status: 'available' }))).toBe(true)
  })
  it('未回答は対応不可', () => {
    expect(isGmMarkedAvailable(gm({ response_status: 'pending' }))).toBe(false)
  })
})

describe('isGmAvailableForCandidate', () => {
  it('available_candidates=[0]: 候補0は true / 候補1は false', () => {
    const g = gm({ response_status: 'available', available_candidates: [0] })
    expect(isGmAvailableForCandidate(g, 0)).toBe(true)
    expect(isGmAvailableForCandidate(g, 1)).toBe(false)
  })

  it('available_candidates=null かつ status=available: 単一/複数候補どちらも true（後方互換フォールバック）', () => {
    const g = gm({ response_status: 'available', available_candidates: null })
    expect(isGmAvailableForCandidate(g, 0)).toBe(true)
    expect(isGmAvailableForCandidate(g, 1)).toBe(true)
    expect(isGmAvailableForCandidate(g, 2)).toBe(true)
  })

  it('available_candidates=[] かつ status=available: フォールバックで全候補 true', () => {
    const g = gm({ response_status: 'available', available_candidates: [] })
    expect(isGmAvailableForCandidate(g, 0)).toBe(true)
    expect(isGmAvailableForCandidate(g, 1)).toBe(true)
  })

  it('status=unavailable / all_unavailable: 候補指定があっても常に false', () => {
    expect(
      isGmAvailableForCandidate(gm({ response_status: 'unavailable', available_candidates: [0] }), 0)
    ).toBe(false)
    expect(
      isGmAvailableForCandidate(gm({ response_status: 'all_unavailable' }), 0)
    ).toBe(false)
  })

  it('未回答（pending）は常に false', () => {
    expect(isGmAvailableForCandidate(gm({ response_status: 'pending' }), 0)).toBe(false)
    expect(isGmAvailableForCandidate(gm({}), 0)).toBe(false)
  })
})

import { gmCandidateIndex, restoredGmCandidateIndex } from './gmAvailabilityStatus'
describe('保存済みの候補位置と画面番号', () => {
  it('飛び番の候補番号をGM回答の位置に流用しない', () => {
    const candidate = { order: 8, responseIndex: 0 }
    expect(isGmAvailableForCandidate(gm({ response_status: 'available', available_candidates: [0] }), gmCandidateIndex(candidate))).toBe(true)
    expect(isGmAvailableForCandidate(gm({ response_status: 'available', available_candidates: [7] }), gmCandidateIndex(candidate))).toBe(false)
  })
  it('過去の候補を復元・並べ替えしても日時で保存位置へ戻す', () => {
    const first = { date: '2026-10-01', startTime: '14:00', endTime: '17:00' }
    const second = { ...first, date: '2026-10-02' }
    expect(restoredGmCandidateIndex(second, [first, second])).toBe(1)
    expect(restoredGmCandidateIndex(first, [second, first])).toBe(1)
  })
  it('対応不明・同日時重複の過去候補に全日程可の回答を転用しない', () => {
    const time = { date: '2026-10-01', startTime: '14:00', endTime: '17:00' }
    expect(restoredGmCandidateIndex(time, [time, time])).toBe(-1)
    expect(restoredGmCandidateIndex(time, [{ ...time, startTime: '15:00' }])).toBe(-1)
    expect(isGmAvailableForCandidate(gm({ response_status: 'available' }), -1)).toBe(false)
  })
})

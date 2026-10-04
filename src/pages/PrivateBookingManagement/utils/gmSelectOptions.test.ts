import { describe, expect, it } from 'vitest'
import { buildGmSelectOptions } from './gmSelectOptions'
import type { PrivateBookingRequest } from '../hooks/usePrivateBookingData'

const request = { id: 'r', candidate_datetimes: { candidates: [{ order: 1, date: '2026-11-01', timeSlot: '夜', startTime: '19:00', endTime: '22:00', status: 'pending', gm_response_index: 0 }] } } as unknown as PrivateBookingRequest
const base = {
  mergedGmOptions: [{ id: 'a', name: 'あおき' }, { id: 'b', name: 'いとう' }, { id: 'c', name: 'うえだ' }],
  availableGMs: [{ gm_id: 'b', response_status: 'available', available_candidates: [0] }],
  assignedGMIds: ['c'],
  selectedRequest: request,
  candidateTime: (_r: PrivateBookingRequest, c: { date: string; startTime: string; endTime: string }) => c,
  conflictsReady: true,
}

describe('承認の GM の選択肢', () => {
  it('担当 → 対応可能 → その他の順。予約済みは選べない', () => {
    const opts = buildGmSelectOptions({ ...base, selectedCandidateOrder: 1, gmConflictOf: (_r, _c, id) => id === 'a' })
    expect(opts.map(o => o.label)).toEqual(['うえだ [担当]', 'いとう [対応可能]', 'あおき [予約済み]'])
    expect(opts.find(o => o.gm.id === 'a')?.isGMDisabled).toBe(true)
  })
  it('空き状況を確認中・確認できないときも選べない', () => {
    const opts = buildGmSelectOptions({ ...base, selectedCandidateOrder: 1, conflictsReady: false, gmConflictOf: () => undefined })
    expect(opts.every(o => o.isGMDisabled)).toBe(true)
    expect(opts[0].label).toContain('確認中')
  })
})

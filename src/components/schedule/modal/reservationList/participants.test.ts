import { describe, expect, it } from 'vitest'
import { sumActiveParticipants } from './participants'

describe('sumActiveParticipants', () => {
  it('有効ステータス（pending/confirmed/gm_confirmed/checked_in）のみ合算', () => {
    const list = [
      { status: 'pending', participant_count: 2 },
      { status: 'confirmed', participant_count: 3 },
      { status: 'gm_confirmed', participant_count: 1 },
      { status: 'checked_in', participant_count: 4 },
    ]
    expect(sumActiveParticipants(list)).toBe(10)
  })

  it('無効ステータス（cancelled 等）は除外', () => {
    const list = [
      { status: 'confirmed', participant_count: 3 },
      { status: 'cancelled', participant_count: 5 },
      { status: 'no_show', participant_count: 2 },
    ]
    expect(sumActiveParticipants(list)).toBe(3)
  })

  it('status 未設定・participant_count 未設定は 0 扱い', () => {
    const list = [
      { participant_count: 9 },
      { status: 'confirmed' },
      { status: 'confirmed', participant_count: null },
      { status: 'confirmed', participant_count: 2 },
    ]
    expect(sumActiveParticipants(list)).toBe(2)
  })

  it('空配列は 0', () => {
    expect(sumActiveParticipants([])).toBe(0)
  })
})

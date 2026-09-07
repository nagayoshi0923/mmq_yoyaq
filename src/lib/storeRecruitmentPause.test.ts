import { describe, expect, it } from 'vitest'
import {
  getStoreRecruitmentPauseKind,
  isDateInRecruitmentPause,
  recruitmentPauseCellLabel,
} from './storeRecruitmentPause'

describe('isDateInRecruitmentPause', () => {
  it('両方空は全日程', () => {
    expect(isDateInRecruitmentPause('2026-08-30', { starts_on: null, ends_on: null })).toBe(true)
  })

  it('開始だけならその日からずっと', () => {
    expect(isDateInRecruitmentPause('2026-08-29', { starts_on: '2026-08-30', ends_on: null })).toBe(false)
    expect(isDateInRecruitmentPause('2026-08-30', { starts_on: '2026-08-30', ends_on: null })).toBe(true)
    expect(isDateInRecruitmentPause('2026-12-01', { starts_on: '2026-08-30', ends_on: null })).toBe(true)
  })

  it('期間内だけ真', () => {
    const p = { starts_on: '2026-08-30', ends_on: '2026-09-07' }
    expect(isDateInRecruitmentPause('2026-08-29', p)).toBe(false)
    expect(isDateInRecruitmentPause('2026-08-30', p)).toBe(true)
    expect(isDateInRecruitmentPause('2026-09-07', p)).toBe(true)
    expect(isDateInRecruitmentPause('2026-09-08', p)).toBe(false)
  })
})

describe('getStoreRecruitmentPauseKind', () => {
  const periods = [
    { store_id: 'a', pause_type: 'performance' as const, starts_on: '2026-08-30', ends_on: '2026-09-07' },
    { store_id: 'a', pause_type: 'private' as const, starts_on: null, ends_on: null },
    { store_id: 'b', pause_type: 'performance' as const, starts_on: '2026-08-30', ends_on: '2026-09-07' },
  ]

  it('店と種類を独立に見る', () => {
    expect(getStoreRecruitmentPauseKind('2026-08-31', 'a', periods)).toBe('both')
    expect(getStoreRecruitmentPauseKind('2026-08-01', 'a', periods)).toBe('private')
    expect(getStoreRecruitmentPauseKind('2026-08-31', 'b', periods)).toBe('performance')
    expect(getStoreRecruitmentPauseKind('2026-08-01', 'b', periods)).toBe('none')
  })
})

describe('recruitmentPauseCellLabel', () => {
  it('セル停止が最優先', () => {
    expect(recruitmentPauseCellLabel('performance', true)).toBe('募集停止')
  })
  it('種類ごとの文言', () => {
    expect(recruitmentPauseCellLabel('performance', false)).toBe('公演募集停止')
    expect(recruitmentPauseCellLabel('private', false)).toBe('貸切募集停止')
    expect(recruitmentPauseCellLabel('both', false)).toBe('募集停止')
    expect(recruitmentPauseCellLabel('none', false)).toBeNull()
  })
})

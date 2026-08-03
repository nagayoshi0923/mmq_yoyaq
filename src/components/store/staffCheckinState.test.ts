import { describe, expect, it } from 'vitest'
import { normalizeStaffCheckinResponse, formatCheckedInTime } from './staffCheckinState'

describe('normalizeStaffCheckinResponse', () => {
  it.each([null, undefined, {}, [], { available: true }, { available: true, my_checkin: {} }, { available: true, my_checkin: { checked_in_at: 'invalid' } }])(
    'null・空・不正レスポンス %j を例外にせずerrorへ変換する',
    value => {
      expect(() => normalizeStaffCheckinResponse(value)).not.toThrow()
      expect(normalizeStaffCheckinResponse(value).status).toBe('error')
    },
  )

  it('利用不可・未打刻・打刻済みを判別する', () => {
    expect(normalizeStaffCheckinResponse({ available: false })).toEqual({ status: 'unavailable' })
    expect(normalizeStaffCheckinResponse({ available: true, my_checkin: null })).toEqual({ status: 'ready-unchecked' })
    expect(normalizeStaffCheckinResponse({ available: true, my_checkin: { checked_in_at: '2026-08-03T04:30:00.000Z' } })).toEqual({
      status: 'ready-checked',
      checkedInAt: '2026-08-03T04:30:00.000Z',
    })
  })

  it('打刻済み時刻をJSTのHH:MMで表示する', () => {
    expect(formatCheckedInTime('2026-08-03T04:30:00.000Z')).toBe('13:30')
  })
})

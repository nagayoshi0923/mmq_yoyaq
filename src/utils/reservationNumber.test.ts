import { describe, expect, it } from 'vitest'
import { generateReservationNumber } from './reservationNumber'

describe('generateReservationNumber', () => {
  it('日付は日本時間の今日（朝9時前でも前日にならない）', () => {
    // 2026-11-22 03:17 JST = 2026-11-21 18:17 UTC
    expect(generateReservationNumber(new Date('2026-11-21T18:17:00Z'), () => 0.5)).toMatch(/^261122-/)
  })
  it('日本時間の夜は当日のまま', () => {
    expect(generateReservationNumber(new Date('2026-11-22T14:59:00Z'), () => 0.5)).toMatch(/^261122-/)
  })
})

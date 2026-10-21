import { describe, expect, it } from 'vitest'
import { isFewSeats, seatCountText } from './seatLabel'

describe('残席の言い方（予約済み/定員）', () => {
  it('予約済み/定員', () => {
    expect(seatCountText(2, 8)).toBe('2/8')
    expect(seatCountText(0, 7)).toBe('0/7')
    expect(seatCountText(9, 8)).toBe('8/8')
  })
  it('残少は残席 1〜3', () => {
    expect(isFewSeats(3)).toBe(true)
    expect(isFewSeats(4)).toBe(false)
    expect(isFewSeats(0)).toBe(false)
  })
})

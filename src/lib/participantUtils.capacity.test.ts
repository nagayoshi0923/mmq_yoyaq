import { expect, it, vi } from 'vitest'
vi.mock('@/lib/supabase', () => ({ supabase: {} }))
import { getAvailableSeats, getAvailabilityStatus } from './participantUtils'
it('作品7名でも公演上限3名が満席なら残席0', () => {
  const event = { max_participants: 3, current_participants: 3 }
  expect(getAvailableSeats(event, 7)).toBe(0)
  expect(getAvailabilityStatus(event, 7)).toBe('sold_out')
})
it('公演指定なしなら作品人数へフォールバックする', () => {
  expect(getAvailableSeats({ current_participants: 3 }, 7)).toBe(4)
})

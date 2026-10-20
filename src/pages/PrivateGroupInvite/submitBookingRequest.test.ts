import { beforeEach, describe, expect, it, vi } from 'vitest'

const m = vi.hoisted(() => ({
  latest: [] as Array<Record<string, unknown>>,
  create: vi.fn(),
  timing: vi.fn(),
  toastError: vi.fn(),
}))
vi.mock('sonner', () => ({ toast: { error: m.toastError, success: vi.fn() } }))
vi.mock('@/lib/supabase', () => ({ supabase: { functions: { invoke: async () => ({ data: { success: true }, error: null }) } } }))
vi.mock('@/lib/privateGroupRead', () => ({ readPrivateGroup: async () => ({ group: { id: 'g', candidate_dates: m.latest } }) }))
vi.mock('@/lib/api/scheduleHookReadApi', () => ({ privateBookingSlotReadApi: {
  getEffectiveDeadlineDays: async () => ({ data: 0, error: null }),
  getPublicAvailability: async () => ({ data: [], error: null }),
} }))
vi.mock('@/lib/api/privateBookingRequestReadApi', () => ({ privateBookingRequestReadApi: { listAvailabilityEvents: async () => ({ data: [], error: null }) } }))
vi.mock('@/lib/privateBookingScenarioTime', () => ({ fetchScenarioTimingFromDb: (...a: unknown[]) => m.timing(...a) }))
vi.mock('@/lib/api/customerApi', () => ({ upsertOwnCustomer: async () => 'customer' }))
vi.mock('@/lib/api/bookingConfirmationReadApi', () => ({ bookingConfirmationReadApi: { findOwnCustomerPhone: async () => ({ data: { phone: '09012345678' }, error: null }) } }))
vi.mock('@/lib/api/privateGroupRpcApi', () => ({ privateGroupRpcApi: { createBookingRequestWithNotice: (...a: unknown[]) => m.create(...a) } }))
vi.mock('@/lib/notificationResult', () => ({ notificationOutcome: () => ({ status: 'accepted' }) }))
vi.mock('@/utils/logger', () => ({ logger: { log: vi.fn(), error: vi.fn() } }))

import { submitGroupBookingRequest } from './submitBookingRequest'

// 店舗の特別営業日で、DB が 14:00〜18:30 に確定した候補（作品の所要 3 時間なら 17:00 になるところ）
const candidate = { id: 'c1', group_id: 'g', date: '2099-11-03', time_slot: '午後', start_time: '14:00:00', end_time: '18:30:00', status: 'pending' }
const ctx = (over: Record<string, unknown> = {}) => ({
  group: { id: 'g', organization_id: 'org', scenario_master_id: 'sc', candidate_dates: [candidate], scenario_masters: { title: '作品' } } as never,
  user: { id: 'u', email: 'u@example.com' },
  isOrganizer: true, canMutateScheduleBeforeStoreReply: true,
  orderedCandidateIds: ['c1'], bookingPhone: '09012345678', bookingNotes: '',
  requestedStores: [{ id: 's1', name: '高田馬場店' }], participantCount: 6,
  organizerMember: undefined, setIsSubmittingBooking: vi.fn(), ...over,
})

beforeEach(() => {
  m.create.mockReset().mockResolvedValue({ data: 'reservation', error: null })
  m.toastError.mockReset()
  m.timing.mockReset().mockResolvedValue({ duration: 180, weekend_duration: null })
  m.latest = [{ ...candidate }]
})

describe('グループから店舗への申込の送信', () => {
  it('候補日の終了は DB の値（18:30）をそのまま送り、作品の所要時間から計算し直さない', async () => {
    expect(await submitGroupBookingRequest(ctx())).toBe(true)
    expect(m.create).toHaveBeenCalledTimes(1)
    expect(m.create.mock.calls[0][0].p_candidate_datetimes.candidates).toEqual([
      { order: 1, date: '2099-11-03', timeSlot: '午後', startTime: '14:00', endTime: '18:30', status: 'pending' },
    ])
  })

  it('送る直前に DB の候補日の時刻が変わっていたら、知らせて止め、何も作らない', async () => {
    m.latest = [{ ...candidate, end_time: '18:00:00' }]
    const onCandidateTimesChanged = vi.fn()
    expect(await submitGroupBookingRequest(ctx({ onCandidateTimesChanged }))).toBe(false)
    expect(m.toastError).toHaveBeenCalledWith('候補日の時刻が更新されました。確認してください')
    expect(onCandidateTimesChanged).toHaveBeenCalledTimes(1)
    expect(m.create).not.toHaveBeenCalled()
  })
})

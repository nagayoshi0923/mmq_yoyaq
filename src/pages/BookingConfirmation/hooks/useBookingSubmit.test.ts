import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
const state = vi.hoisted(() => ({
  event: { max_participants: 12, capacity: 12, current_participants: 0, reservation_deadline_hours: 0, store_id: 'store' },
  settings: { max_participants_per_booking: 1, max_bookings_per_customer: 1, advance_booking_days: 30, same_day_booking_cutoff: 0 },
  deadline: '2026-10-01T01:00:00Z',
  holidayError: false,
  error: false,
  tables: [] as string[],
}))
vi.mock('@/lib/supabase', () => ({ supabase: {
  from: (table: string) => {
    state.tables.push(table)
    if (table === 'organization_scenarios_with_master') {
      const chain = { select: () => chain, eq: () => chain, maybeSingle: async () => ({ data: { participation_fee: 4500, participation_costs: [{ time_slot: 'weekend', amount: 5000 }] }, error: state.error ? { message: 'unavailable' } : null }) }; return chain
    }
    if (!['schedule_events_public', 'reservation_settings'].includes(table)) throw new Error(`Unexpected query: ${table}`)
    const result = () => ({ data: table === 'schedule_events_public' ? state.event : state.settings, error: state.error ? { message: 'unavailable' } : null })
    const chain = { select: () => chain, eq: () => chain, single: async () => result(), maybeSingle: async () => result() }
    return chain
  },
  rpc: async (name: string) => name === 'get_public_custom_holidays'
    ? { data: state.holidayError ? null : [{ custom_holidays: ['2026-05-07'] }], error: state.holidayError ? { message: 'temporary failure' } : null }
    : { data: [{ effective_booking_deadline: state.deadline }], error: null },
} }))
import { checkReservationLimits, calculateParticipationFee } from './useBookingSubmit'
const check = (count: number) => checkReservationLimits('event', count, '2026-10-01', '10:00')
describe('追加の人数・同日件数制限を廃止した予約判定', () => {
  beforeEach(() => {
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-09-24T00:00:00Z'))
    state.event.current_participants = 0
    state.settings.advance_booking_days = 30
    state.deadline = '2026-10-01T01:00:00Z'
    state.error = false; state.tables = []
  })
  afterEach(() => vi.useRealTimers())
  it('古い人数・件数設定が1でも、残席以内の12名を許可し顧客の件数を照会しない', async () => {
    expect(await check(12)).toEqual({ allowed: true })
    expect(state.tables).toEqual(['schedule_events_public'])
  })
  it('公演の定員を超える人数は拒否する', async () => {
    expect(await check(13)).toMatchObject({ allowed: false, reason: '最大参加人数は12名です' })
  })
  it('他の予約で埋まった残席を超える人数は拒否する', async () => {
    state.event.current_participants = 9
    expect(await check(4)).toMatchObject({ allowed: false, reason: '残り3名分の空きしかありません' })
    expect(await check(3)).toEqual({ allowed: true })
  })
  it('満席では予約を拒否する', async () => {
    state.event.current_participants = 12
    expect(await check(1)).toMatchObject({ allowed: false, reason: 'この公演は満席です' })
  })
  it('公演の受付締切は維持し、旧事前予約可能日数は使わない', async () => {
    state.deadline = '2026-09-23T00:00:00Z'
    expect(await check(1)).toMatchObject({ allowed: false, reason: '予約の受付期限を過ぎています' })
    state.deadline = '2026-10-01T01:00:00Z'; state.settings.advance_booking_days = 1
    expect(await check(1)).toEqual({ allowed: true })
  })
  it('取得失敗を予約許可にしない', async () => {
    state.error = true
    expect(await check(1)).toMatchObject({ allowed: false })
  })
})


describe('予約前の表示料金取得', () => {
  beforeEach(() => { state.error = false; state.holidayError = false })
  it('独自休日取得が一時失敗しても予約前の計算を中断しない', async () => {
    state.holidayError = true
    await expect(calculateParticipationFee('scenario','15:00','2026-05-06','org')).resolves.toBe(5000)
  })
  it('取得できた独自休日の土日祝料金を維持する', async () => {
    await expect(calculateParticipationFee('scenario','15:00','2026-05-07','org')).resolves.toBe(5000)
  })
  it('作品の料金そのものを取得できない場合は保存へ進めない', async () => {
    state.error = true
    await expect(calculateParticipationFee('scenario','15:00','2026-05-07','org')).rejects.toThrow('料金情報の取得に失敗')
  })
})

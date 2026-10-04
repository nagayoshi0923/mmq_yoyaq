import { describe, expect, it } from 'vitest'
import { buildDemoReservation, countReservedParticipants, demoReservationNumber, hasDemoParticipant, resolveFillSeatsCapacity } from './fillSeats'

describe('満席にする（デモ参加者）', () => {
  it('満席の人数: シナリオ → 公演の最大 → 定員 → 8 人の順。定員を超えない', () => {
    expect(resolveFillSeatsCapacity({ scenario_masters: { player_count_max: 6 }, max_participants: 8, capacity: null })).toBe(6)
    expect(resolveFillSeatsCapacity({ scenario_masters: { player_count_max: 10 }, max_participants: null, capacity: 7 })).toBe(7)
    expect(resolveFillSeatsCapacity({ scenario_masters: null, max_participants: 5, capacity: null })).toBe(5)
    expect(resolveFillSeatsCapacity({ scenario_masters: null, max_participants: null, capacity: null })).toBe(8)
  })

  it('予約人数の合計とデモ参加者の有無', () => {
    expect(countReservedParticipants([{ participant_count: 2 }, { participant_count: null }, { participant_count: 3 }])).toBe(5)
    expect(hasDemoParticipant([{ participant_names: ['山田'] }])).toBe(false)
    expect(hasDemoParticipant([{ participant_names: ['デモ参加者2'] }])).toBe(true)
    expect(hasDemoParticipant([{ participant_names: null }])).toBe(false)
  })

  it('予約番号は日付とランダム4文字', () => {
    expect(demoReservationNumber(new Date('2026-10-04T00:00:00Z'), () => 0.5)).toMatch(/^261004-[0-9A-Z]{1,4}$/)
  })

  it('デモ参加者の予約: 人数分の名前・金額・当日精算・確定', () => {
    const r = buildDemoReservation({
      event: { id: 'e', date: '2026-10-04', start_time: '19:00:00', scenario: '作品A', scenario_id: 'm', store_id: 's', gms: ['松井'] },
      organizationId: 'org', neededParticipants: 2, participationFee: 4000, duration: 180, reservationNumber: '261004-ABCD',
    })
    expect(r).toMatchObject({
      schedule_event_id: 'e', organization_id: 'org', title: '作品A', scenario_master_id: 'm', store_id: 's',
      customer_notes: 'デモ参加者2名', requested_datetime: '2026-10-04T19:00:00+09:00', duration: 180,
      participant_count: 2, participant_names: ['デモ参加者1', 'デモ参加者2'], assigned_staff: ['松井'],
      base_price: 8000, total_price: 8000, final_price: 8000, unit_price: 4000,
      payment_method: 'onsite', payment_status: 'paid', status: 'confirmed', reservation_source: 'demo',
    })
    expect(buildDemoReservation({ event: { id: 'e', date: 'd', start_time: 't' }, organizationId: 'o', neededParticipants: 1, participationFee: 0, duration: 120, reservationNumber: 'n' }).participant_names).toEqual(['デモ参加者'])
  })
})

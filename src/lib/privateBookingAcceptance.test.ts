import { describe, expect, it } from 'vitest'
import { isPrivateBookingPeriodOpen, isScenarioAcceptingPrivateBooking, privateBookingDateWindow, privateBookingStatus, privateBookingStatusWithStores, privateBookingStoreStatus } from './privateBookingAcceptance'

describe('isScenarioAcceptingPrivateBooking', () => {
  it('未設定は従来どおり受付可とみなす', () => {
    expect(isScenarioAcceptingPrivateBooking({})).toBe(true)
    expect(isScenarioAcceptingPrivateBooking({ accepts_private_booking: true })).toBe(true)
  })

  it('貸切受付OFFは拒否する', () => {
    expect(isScenarioAcceptingPrivateBooking({ accepts_private_booking: false })).toBe(false)
  })

  it('出張公演限定は拒否する', () => {
    expect(
      isScenarioAcceptingPrivateBooking({
        accepts_private_booking: true,
        scenario_kind: 'offsite_only',
      }),
    ).toBe(false)
  })

  it('null/undefined は拒否する', () => {
    expect(isScenarioAcceptingPrivateBooking(null)).toBe(false)
    expect(isScenarioAcceptingPrivateBooking(undefined)).toBe(false)
  })
})

describe('privateBookingStatus（作品単位の貸切受付。トップ・作品ページの「貸切受付中」）', () => {
  const TODAY = '2026-10-24'
  const base = { accepts_private_booking: true, scenario_kind: 'regular', booking_start_date: null, booking_end_date: null, available_until: null }

  it('受付 ON・期間の指定なしは受付中（公演予定の有無は見ない）', () => {
    expect(privateBookingStatus(base, TODAY)).toBe('accepting')
    expect(privateBookingStatus({ ...base, booking_start_date: '2026-10-24', booking_end_date: '2026-10-24', available_until: '2026-10-24' }, TODAY)).toBe('accepting')
  })

  it('貸切受付 OFF（貸切休止中）・出張限定は受付していない', () => {
    expect(privateBookingStatus({ ...base, accepts_private_booking: false }, TODAY)).toBe('not_accepting')
    expect(privateBookingStatus({ ...base, scenario_kind: 'offsite_only' }, TODAY)).toBe('not_accepting')
  })

  it('貸切募集期間の外（終了・開始前）と公演期間の終了は closed', () => {
    expect(privateBookingStatus({ ...base, booking_end_date: '2026-10-23' }, TODAY)).toBe('closed')
    expect(privateBookingStatus({ ...base, booking_start_date: '2026-10-25' }, TODAY)).toBe('closed')
    expect(privateBookingStatus({ ...base, available_until: '2026-10-23' }, TODAY)).toBe('closed')
  })

  it('判定に要る値を読めていなければ unknown（受付中と言わない）', () => {
    expect(privateBookingStatus(null, TODAY)).toBe('unknown')
    expect(privateBookingStatus({ scenario_kind: 'regular', available_until: null }, TODAY)).toBe('unknown')
    expect(privateBookingStatus({ ...base, available_until: undefined }, TODAY)).toBe('unknown')
  })

  it('貸切募集期間は DB（not_recruiting）と同じく今日で比べる', () => {
    expect(isPrivateBookingPeriodOpen({ booking_end_date: '2026-10-24' }, TODAY)).toBe(true)
    expect(isPrivateBookingPeriodOpen({ booking_end_date: '2026-10-23' }, TODAY)).toBe(false)
  })
})

describe('列が欠けた応答（undefined）を「制限なし」（null）と取り違えない', () => {
  const TODAY = '2026-10-24'
  const full = { accepts_private_booking: true, scenario_kind: 'regular', booking_start_date: null, booking_end_date: null, available_until: null }
  for (const key of ['accepts_private_booking', 'scenario_kind', 'booking_start_date', 'booking_end_date', 'available_until'] as const) {
    it(`${key} が無ければ unknown`, () => {
      const input: Record<string, unknown> = { ...full }
      delete input[key]
      expect(privateBookingStatus(input, TODAY)).toBe('unknown')
    })
  }
})

describe('受付対象期間（公演日の範囲。締切・受付範囲・公演期間。DB の assert_private_booking_candidate_date と同じ条件）', () => {
  it('今日 + 締切日数 〜 今日 + 範囲日数。公演期間で狭める。空なら null', () => {
    expect(privateBookingDateWindow({ todayJst: '2026-10-24', deadlineDays: 14, horizonDays: 180, available_from: null, available_until: null }))
      .toEqual({ from: '2026-11-07', to: '2027-04-22' })
    expect(privateBookingDateWindow({ todayJst: '2026-10-24', deadlineDays: 0, horizonDays: 30, available_from: '2026-11-01', available_until: '2026-11-10' }))
      .toEqual({ from: '2026-11-01', to: '2026-11-10' })
    // 受付範囲の N 日以内に申し込める日が無い（締切 > 範囲、公演期間が締切より前に終わる、範囲より後に始まる）
    expect(privateBookingDateWindow({ todayJst: '2026-10-24', deadlineDays: 30, horizonDays: 20, available_from: null, available_until: null })).toBeNull()
    expect(privateBookingDateWindow({ todayJst: '2026-10-24', deadlineDays: 14, horizonDays: 180, available_from: null, available_until: '2026-11-06' })).toBeNull()
    expect(privateBookingDateWindow({ todayJst: '2026-10-24', deadlineDays: 0, horizonDays: 30, available_from: '2026-11-24', available_until: null })).toBeNull()
  })
})

describe('店舗の貸切募集停止（I6。公演日で判定。境界の日を含み、空の端は無期限）', () => {
  const TODAY = '2026-10-24'
  // 締切 1 日・範囲 30 日 → 受付対象期間 10/25〜11/23
  const W = privateBookingDateWindow({ todayJst: TODAY, deadlineDays: 1, horizonDays: 30, available_from: null, available_until: null })!
  const p = (store_id: string, starts_on: string | null, ends_on: string | null) => ({ store_id, pause_type: 'private' as const, starts_on, ends_on })
  const full = { accepts_private_booking: true, scenario_kind: 'regular', booking_start_date: null, booking_end_date: null, available_until: null }

  it('今日だけ全店舗停止で、受付対象期間（明日以降）は停止なし → 受付中', () => {
    expect(privateBookingStoreStatus(['s1', 's2'], [p('s1', TODAY, TODAY), p('s2', TODAY, TODAY)], W)).toBe('open')
  })
  it('明日から無期限で全店舗停止（今日はまだ停止前、今日の公演日は締切後）→ 受付中にしない', () => {
    expect(privateBookingStoreStatus(['s1', 's2'], [p('s1', '2026-10-25', null), p('s2', '2026-10-25', null)], W)).toBe('paused')
  })
  it('受付対象期間の一部だけ全店舗停止 → 受付中', () => {
    expect(privateBookingStoreStatus(['s1', 's2'], [p('s1', '2026-11-01', '2026-11-10'), p('s2', '2026-11-01', '2026-11-10')], W)).toBe('open')
  })
  it('一部の店舗だけ期間すべて停止 → 他の店舗が可なら受付中', () => {
    expect(privateBookingStoreStatus(['s1', 's2'], [p('s1', null, null)], W)).toBe('open')
  })
  it('境界: 停止が受付対象期間の初日〜最終日ちょうどなら覆う。1 日でも外れれば残る', () => {
    expect(privateBookingStoreStatus(['s1'], [p('s1', '2026-10-25', '2026-11-23')], W)).toBe('paused')
    expect(privateBookingStoreStatus(['s1'], [p('s1', '2026-10-26', '2026-11-23')], W)).toBe('open')
    expect(privateBookingStoreStatus(['s1'], [p('s1', '2026-10-25', '2026-11-22')], W)).toBe('open')
  })
  it('境界: 隙間なく続く複数の停止は合わせて覆う。1 日の隙間があれば残る', () => {
    expect(privateBookingStoreStatus(['s1'], [p('s1', null, '2026-11-01'), p('s1', '2026-11-02', null)], W)).toBe('paused')
    expect(privateBookingStoreStatus(['s1'], [p('s1', null, '2026-11-01'), p('s1', '2026-11-03', null)], W)).toBe('open')
  })
  it('公演の募集停止（performance）は貸切の判定に使わない。店舗が無ければ no_store、期間が空なら no_dates、読めなければ unknown', () => {
    expect(privateBookingStoreStatus(['s1'], [{ store_id: 's1', pause_type: 'performance', starts_on: null, ends_on: null }], W)).toBe('open')
    expect(privateBookingStoreStatus([], [], W)).toBe('no_store')
    expect(privateBookingStoreStatus(['s1'], [], null)).toBe('no_dates')
    expect(privateBookingStoreStatus(['s1'], null, W)).toBe('unknown')
  })
  it('作品として受付中でも、全店舗停止・期間なしなら受付中にしない。日数が読めなければ unknown', () => {
    expect(privateBookingStatusWithStores(full, ['s1'], [p('s1', null, null)], W, TODAY)).toBe('paused')
    expect(privateBookingStatusWithStores(full, ['s1'], [], null, TODAY)).toBe('no_dates')
    expect(privateBookingStatusWithStores(full, ['s1'], [], W, TODAY)).toBe('accepting')
    expect(privateBookingStatusWithStores(full, ['s1'], [], undefined, TODAY)).toBe('unknown')
    expect(privateBookingStatusWithStores(full, null, [], W, TODAY)).toBe('unknown')
  })
})

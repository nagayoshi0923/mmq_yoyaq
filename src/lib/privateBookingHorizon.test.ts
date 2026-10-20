import { describe, expect, it, vi } from 'vitest'
vi.mock('@/lib/supabase', () => ({ supabase: {} }))
import { addYmdDays, isBeyondPrivateBookingHorizon, privateBookingHorizonMaxYmd, privateBookingTooFarText } from './privateBookingHorizon'
import { buildCandidateSlotAvailability } from './candidateSlotAvailability'
import { isValidSettingValue } from '../../supabase/functions/_shared/setting-definitions'
import { resolveSetting } from '../../supabase/functions/_shared/settings-inheritance'
import { SETTING_DEFAULTS } from '../../supabase/functions/_shared/setting-defaults'

// 日本時間 2026-10-20 23:30（UTC では 14:30）。見ている人のタイムゾーンに関係なく日本時間の今日から数える
const now = new Date('2026-10-20T14:30:00Z')

describe('貸切を受け付ける範囲（I21）', () => {
  it('今日 + 日数の日までは範囲内、その翌日から範囲外', () => {
    expect(privateBookingHorizonMaxYmd(180, now)).toBe('2027-04-18')
    expect(isBeyondPrivateBookingHorizon('2027-04-18', 180, now)).toBe(false)
    expect(isBeyondPrivateBookingHorizon('2027-04-19', 180, now)).toBe(true)
    expect(isBeyondPrivateBookingHorizon(addYmdDays('2026-10-20', 91), 90, now)).toBe(true)
    expect(isBeyondPrivateBookingHorizon(addYmdDays('2026-10-20', 90), 90, now)).toBe(false)
    expect(isBeyondPrivateBookingHorizon('', 90, now)).toBe(false)
  })
  it('日本時間の日付の変わり目で数える（UTC では前日の 15:00 が日本時間の 0:00）', () => {
    expect(privateBookingHorizonMaxYmd(1, new Date('2026-10-20T15:00:00Z'))).toBe('2026-10-22')
  })
  it('文面は DB と同じ', () => {
    expect(privateBookingTooFarText(90)).toBe('申し込めるのは今日から 90 日先までです')
  })
  it('空き判定の too_far は DB の文面（detail）をそのまま理由にする', () => {
    const availability = buildCandidateSlotAvailability([{ date: '2027-04-19', time_slot: 'afternoon', available: false, reason: 'too_far', start_time: null, end_time: null, detail: '申し込めるのは今日から 180 日先までです' }])
    expect(availability.unavailableReasons['2027-04-19-午後']).toBe('申し込めるのは今日から 180 日先までです')
  })
  it('設定は 1〜180 の整数。MMQ の既定 180 → 組織 → 作品 → 公演の順で、店舗では指定しない', () => {
    expect(SETTING_DEFAULTS.private_booking_horizon_days).toBe(180)
    expect(isValidSettingValue('private_booking_horizon_days', 90, 'organization')).toBe(true)
    expect(isValidSettingValue('private_booking_horizon_days', 120, 'scenario')).toBe(true)
    expect(isValidSettingValue('private_booking_horizon_days', 30, 'performance')).toBe(true)
    expect(isValidSettingValue('private_booking_horizon_days', 90, 'store')).toBe(false)
    for (const bad of [0, 181, 1.5, '90']) expect(isValidSettingValue('private_booking_horizon_days', bad, 'organization')).toBe(false)
    const scopes = ['organization', 'scenario', 'performance'] as const
    expect(resolveSetting('private_booking_horizon_days', 180, { organization: { private_booking_horizon_days: 90 }, scenario: { private_booking_horizon_days: 120 } }, scopes))
      .toEqual({ value: 120, source: 'scenario' })
    expect(resolveSetting('private_booking_horizon_days', 180, { organization: { private_booking_horizon_days: 90 }, scenario: { private_booking_horizon_days: 120 }, performance: { private_booking_horizon_days: 30 } }, scopes))
      .toEqual({ value: 30, source: 'performance' })
  })
})

import { describe, expect, it } from 'vitest'
import { buildBookingGuide, freeCancelHours, formatJstDateTime } from '../../supabase/functions/_shared/booking-confirmation-guide'
import { freeSelfCancelHours } from '@/lib/cancellationSummary'

const FEES = [
  { hours_before: 48, fee_percentage: 50 },
  { hours_before: 24, fee_percentage: 100 },
  { hours_before: -1, fee_percentage: 100 },
]

describe('予約完了メールの案内（点検 31）', () => {
  it('無料で取り消せる期限は画面の考え方と同じ', () => {
    for (const [deadline, fees] of [[48, FEES], [0, FEES], [24, []], [null, [{ hours_before: 72, fee_percentage: 30 }]]] as const) {
      expect(freeCancelHours(deadline, fees)).toBe(freeSelfCancelHours(deadline, fees as never))
    }
  })

  it('期限の日時を日本時間で出す', () => {
    const guide = buildBookingGuide({
      eventDate: '2026-10-24', startTime: '13:00:00', deadlineHours: 48, fees: FEES,
      now: new Date('2026-10-11T00:00:00Z'),
    })
    expect(guide.cancelDeadline).toContain('2026年10月22日(木) 13:00 まで')
    expect(guide.paymentNote).toContain('税込')
    expect(guide.paymentNote).toContain('現金またはカード')
    expect(guide.mypageUrl).toBe('https://mmq.game/mypage')
  })

  it('期限を過ぎた予約はその旨を出す', () => {
    const guide = buildBookingGuide({
      eventDate: '2026-10-12', startTime: '19:00', deadlineHours: 48, fees: FEES,
      now: new Date('2026-10-11T12:00:00Z'),
    })
    expect(guide.cancelDeadline).toContain('すでに過ぎています')
  })

  it('店舗の支払い案内があればそれを使う', () => {
    const guide = buildBookingGuide({
      eventDate: '2026-10-24', startTime: '13:00', deadlineHours: 48, fees: FEES,
      paymentDescription: '受付で現金のみお支払いください', siteUrl: 'https://example.test/',
    })
    expect(guide.paymentNote).toBe('受付で現金のみお支払いください（金額は税込です）')
    expect(guide.mypageUrl).toBe('https://example.test/mypage')
  })

  it('日付が読めなければマイページへ案内する', () => {
    expect(buildBookingGuide({ eventDate: '', startTime: '', deadlineHours: 48, fees: FEES }).cancelDeadline).toContain('マイページ')
    expect(formatJstDateTime(new Date('2026-10-22T04:00:00Z'))).toBe('2026年10月22日(木) 13:00')
  })
})

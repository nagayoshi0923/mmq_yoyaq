import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/supabase', () => ({
  supabase: { rpc: vi.fn() },
}))
import { buildPublicCancellationPolicyPath } from './publicBookingPath'
import {
  formatCancellationFeeBasis,
  formatCancellationFeePeriod,
  formatPolicyHours,
} from './publicCancellationPolicy'

describe('buildPublicCancellationPolicyPath', () => {
  it('組織と明示店舗をcanonical URLへ保持する', () => {
    expect(buildPublicCancellationPolicyPath('queens-waltz', 'store-1'))
      .toBe('/queens-waltz/cancel-policy?store=store-1')
  })

  it('管理設定で組織不明時はstore queryを付けずrootへ戻す', () => {
    expect(buildPublicCancellationPolicyPath(null, 'store-1')).toBe('/cancel-policy')
  })
})

describe('public cancellation policy formatting', () => {
  it('料率の適用区間を境界どおり表示する', () => {
    const fifty = { hours_before: 48, fee_percentage: 50, description: '' }
    const hundred = { hours_before: 24, fee_percentage: 100, description: '' }
    const after = { hours_before: -1, fee_percentage: 100, description: '' }

    expect(formatCancellationFeePeriod(fifty, hundred)).toBe('2日前から1日前まで')
    expect(formatCancellationFeePeriod(hundred, after)).toBe('1日前から開演時刻まで')
    expect(formatCancellationFeePeriod(after)).toBe('公演開始後・無断キャンセル')
  })

  it('期限と料金基準を顧客向けラベルにする', () => {
    expect(formatPolicyHours(0)).toBe('開演時刻')
    expect(formatPolicyHours(50)).toBe('2日2時間前')
    expect(formatCancellationFeeBasis('participant_total')).toBe('予約時の参加料金合計')
    expect(formatCancellationFeeBasis('performance_total')).toBe('公演価格全額')
  })
})

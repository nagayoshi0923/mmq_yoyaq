import { beforeEach, describe, expect, it, vi } from 'vitest'

const rpc = vi.fn()
vi.mock('@/lib/supabase', () => ({
  supabase: { rpc: (...args: unknown[]) => rpc(...args) },
}))
import { buildPublicCancellationPolicyPath } from './publicBookingPath'
import {
  fetchPublicCancellationTerms,
  formatCancellationFeeBasis,
  formatCancellationFeePeriod,
  formatPolicyHours,
} from './publicCancellationPolicy'

const fees = [
  { hours_before: 48, fee_percentage: 50, description: '前日より50%' },
  { hours_before: 24, fee_percentage: 100, description: '当日より100%' },
]

describe('fetchPublicCancellationTerms', () => {
  beforeEach(() => { rpc.mockReset() })

  it('店舗が規定を個別設定していなくても、DB の既定の規定が返れば読めた扱い（isFallback=false）', async () => {
    rpc.mockResolvedValue({ data: [{
      store_id: 's1', is_configured: false,
      cancellation_deadline_hours: 48, cancellation_fees: fees, reservation_change_deadline_hours: 24,
    }], error: null })
    const terms = await fetchPublicCancellationTerms({ organizationSlug: 'queenswaltz-sapporo', storeId: 's1', eventId: 'e1' })
    expect(terms.isFallback).toBe(false)
    expect(terms.deadlineHours).toBe(48)
    expect(terms.fees).toHaveLength(2)
    expect(terms.changeDeadlineHours).toBe(24)
  })

  it('行が無いときは既定値で isFallback', async () => {
    rpc.mockResolvedValue({ data: [], error: null })
    const terms = await fetchPublicCancellationTerms({ organizationSlug: 'x', storeId: 's1', eventId: 'e1' })
    expect(terms.isFallback).toBe(true)
  })

  it('値が欠けているときは既定値で isFallback', async () => {
    rpc.mockResolvedValue({ data: [{ store_id: 's1', is_configured: true, cancellation_deadline_hours: null, cancellation_fees: [] }], error: null })
    const terms = await fetchPublicCancellationTerms({ organizationSlug: 'x', storeId: 's1', eventId: 'e1' })
    expect(terms.isFallback).toBe(true)
  })

  it('取得失敗は既定値で isFallback', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'boom' } })
    const terms = await fetchPublicCancellationTerms({ organizationSlug: 'x', storeId: 's1', eventId: 'e1' })
    expect(terms.isFallback).toBe(true)
  })
})

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

    expect(formatCancellationFeePeriod(fifty, hundred)).toBe('48時間前から24時間前になるまで')
    expect(formatCancellationFeePeriod(hundred, after)).toBe('24時間前から開演時刻まで')
    expect(formatCancellationFeePeriod(after)).toBe('公演開始後・無断キャンセル')
  })

  it('期限と料金基準を顧客向けラベルにする', () => {
    expect(formatPolicyHours(0)).toBe('開演時刻')
    expect(formatPolicyHours(50)).toBe('50時間前')
    expect(formatPolicyHours(48)).toBe('48時間前')
    expect(formatPolicyHours(168)).toBe('168時間前（7日前）')
    expect(formatPolicyHours(720)).toBe('720時間前（30日前）')
    expect(formatCancellationFeeBasis('participant_total')).toBe('予約時の参加料金合計')
    expect(formatCancellationFeeBasis('performance_total')).toBe('公演価格全額')
  })
})

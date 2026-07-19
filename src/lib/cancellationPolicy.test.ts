import { describe, expect, it } from 'vitest'
import type { CancellationFeeRule, Reservation } from '@/types'
import {
  calculateCancellation,
  resolveCancellationPolicy,
  type CalculableCancellationPolicy,
} from './cancellationPolicy'

const OPEN_FEES: CancellationFeeRule[] = [
  { hours_before: 48, fee_percentage: 50, description: '前日より50%' },
  { hours_before: 24, fee_percentage: 100, description: '当日より100%' },
  { hours_before: -1, fee_percentage: 100, description: '公演開始後100%' },
]

const PRIVATE_FEES: CancellationFeeRule[] = [
  { hours_before: 168, fee_percentage: 50, description: '7日前より50%' },
  { hours_before: 72, fee_percentage: 100, description: '3日前より100%' },
  { hours_before: -1, fee_percentage: 100, description: '公演開始後100%' },
]

function policy(
  overrides: Partial<CalculableCancellationPolicy> = {},
): CalculableCancellationPolicy {
  return {
    status: 'ready',
    performanceType: 'open',
    deadlineHours: 0,
    fees: OPEN_FEES,
    feeBasis: 'participant_total',
    storeId: 'store-open',
    policyUpdatedAt: '2026-07-19T00:00:00+09:00',
    snapshotVersion: 1,
    source: 'reservation_snapshot',
    ...overrides,
  }
}

function calculate(now: string, resolvedPolicy = policy()) {
  return calculateCancellation({
    performanceDate: '2026-08-08',
    performanceStartTime: '10:00:00',
    now,
    policy: resolvedPolicy,
    basisAmounts: {
      participant_total: 1001,
      performance_total: 60000,
    },
  })
}

describe('calculateCancellation', () => {
  it('JSTの開演境界と0時間期限を固定する', () => {
    expect(calculate('2026-08-08T00:59:59.999Z').canCancel).toBe(true)
    const atStart = calculate('2026-08-08T01:00:00.000Z')
    expect(atStart.performanceStart.toISOString()).toBe('2026-08-08T01:00:00.000Z')
    expect(atStart.hoursUntilPerformance).toBe(0)
    expect(atStart.canCancel).toBe(true)
    expect(calculate('2026-08-08T01:00:00.001Z').canCancel).toBe(false)
  })

  it('オープンの48時間/24時間境界で50%/100%を適用する', () => {
    expect(calculate('2026-08-06T01:00:00.000Z').feePercentage).toBe(50)
    expect(calculate('2026-08-07T01:00:00.000Z').feePercentage).toBe(100)
  })

  it('貸切の7日/3日境界を同じ計算基盤で扱う', () => {
    const privatePolicy = policy({
      performanceType: 'private',
      fees: PRIVATE_FEES,
      feeBasis: 'performance_total',
      storeId: 'store-private',
    })
    expect(calculate('2026-08-01T00:59:59.999Z', privatePolicy).feePercentage).toBe(0)
    expect(calculate('2026-08-01T01:00:00.000Z', privatePolicy).feePercentage).toBe(50)
    expect(calculate('2026-08-05T00:59:59.999Z', privatePolicy).feePercentage).toBe(50)
    expect(calculate('2026-08-05T01:00:00.000Z', privatePolicy).feePercentage).toBe(100)
    expect(calculate('2026-08-05T01:00:00.000Z', privatePolicy).feeAmount).toBe(60000)
  })

  it('円未満は四捨五入する', () => {
    expect(calculate('2026-08-06T01:00:00.000Z').feeAmount).toBe(501)
  })
})

describe('resolveCancellationPolicy', () => {
  it('予約snapshotを複製して返し、後続の設定変更を遡及させない', () => {
    const reservation = {
      reservation_source: 'web',
      private_group_id: null,
      cancellation_policy_snapshot_version: 1,
      cancellation_policy_store_id: 'store-1',
      cancellation_policy_performance_type: 'open',
      cancellation_policy_deadline_hours: 0,
      cancellation_policy_fees: OPEN_FEES,
      cancellation_policy_fee_basis: 'participant_total',
      cancellation_policy_updated_at: '2026-07-01T10:00:00+09:00',
    } satisfies Partial<Reservation>

    const resolved = resolveCancellationPolicy(reservation as Reservation)
    OPEN_FEES[0].fee_percentage = 99

    expect(resolved.source).toBe('reservation_snapshot')
    if (resolved.status === 'ready') {
      expect(resolved.fees[0].fee_percentage).toBe(50)
      expect(resolved.storeId).toBe('store-1')
    }
    OPEN_FEES[0].fee_percentage = 50
  })

  it('既存予約は現在設定ではなく不変の貸切互換既定値を使う', () => {
    const legacy = resolveCancellationPolicy({
      reservation_source: 'web_private',
      private_group_id: 'group-1',
      cancellation_policy_snapshot_version: null,
    } as Reservation)

    expect(legacy.source).toBe('legacy_default')
    expect(legacy.performanceType).toBe('private')
    if (legacy.status === 'ready') {
      expect(legacy.feeBasis).toBe('performance_total')
      expect(legacy.fees.map(fee => [fee.hours_before, fee.fee_percentage])).toEqual([
        [168, 50],
        [72, 100],
        [-1, 100],
      ])
    }
  })

  it('version=1の店舗未確定snapshotはlegacyへ落とさず計算不能のまま保持する', () => {
    const pending = resolveCancellationPolicy({
      reservation_source: 'web_private',
      private_group_id: 'group-pending',
      cancellation_policy_snapshot_version: 1,
      cancellation_policy_store_id: null,
      cancellation_policy_performance_type: 'private',
      cancellation_policy_deadline_hours: null,
      cancellation_policy_fees: null,
      cancellation_policy_fee_basis: null,
      cancellation_policy_updated_at: null,
    } as Reservation)

    expect(pending).toEqual({
      status: 'pending',
      performanceType: 'private',
      deadlineHours: null,
      fees: null,
      feeBasis: null,
      storeId: null,
      policyUpdatedAt: null,
      snapshotVersion: 1,
      source: 'reservation_snapshot_pending',
      reason: 'store_assignment_pending',
    })

    expect(() => calculateCancellation({
      performanceDate: '2026-08-08',
      performanceStartTime: '10:00:00',
      now: '2026-08-01T01:00:00.000Z',
      policy: pending as unknown as CalculableCancellationPolicy,
      basisAmounts: {
        participant_total: 1001,
        performance_total: 60000,
      },
    })).toThrowError('Cancellation policy snapshot is not ready')
  })

  it('version=1の不完全snapshotはstore確定済みでもlegacy料金を返さない', () => {
    const incomplete = resolveCancellationPolicy({
      reservation_source: 'web',
      private_group_id: null,
      cancellation_policy_snapshot_version: 1,
      cancellation_policy_store_id: 'store-incomplete',
      cancellation_policy_performance_type: 'open',
      cancellation_policy_deadline_hours: 0,
      cancellation_policy_fees: null,
      cancellation_policy_fee_basis: 'participant_total',
      cancellation_policy_updated_at: null,
    } as Reservation)

    expect(incomplete.status).toBe('pending')
    expect(incomplete.snapshotVersion).toBe(1)
    expect(incomplete.source).toBe('reservation_snapshot_pending')
    if (incomplete.status === 'pending') {
      expect(incomplete.reason).toBe('snapshot_incomplete')
      expect(incomplete.fees).toBeNull()
    }
  })
})

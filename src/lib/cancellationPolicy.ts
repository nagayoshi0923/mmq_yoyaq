import {
  DEFAULT_OPEN_CANCELLATION_FEES,
  DEFAULT_OPEN_CANCEL_DEADLINE_HOURS,
  DEFAULT_PRIVATE_CANCELLATION_FEES,
  DEFAULT_PRIVATE_CANCEL_DEADLINE_HOURS,
} from '@/constants/cancellationPolicyDefaults'
import { RESERVATION_SOURCE } from '@/lib/constants'
import type {
  CancellationFeeBasis,
  CancellationFeeRule,
  CancellationPerformanceType,
  Reservation,
} from '@/types'

const HOUR_MS = 60 * 60 * 1000

interface CancellationPolicyIdentity {
  performanceType: CancellationPerformanceType
  storeId: string | null
  policyUpdatedAt: string | null
}

export interface CalculableCancellationPolicy extends CancellationPolicyIdentity {
  status: 'ready'
  deadlineHours: number
  fees: CancellationFeeRule[]
  feeBasis: CancellationFeeBasis
  snapshotVersion: 1 | null
  source: 'reservation_snapshot' | 'legacy_default'
}

export interface PendingCancellationPolicy extends CancellationPolicyIdentity {
  status: 'pending'
  deadlineHours: null
  fees: null
  feeBasis: null
  snapshotVersion: 1
  source: 'reservation_snapshot_pending'
  reason: 'store_assignment_pending' | 'snapshot_incomplete'
}

export type ResolvedCancellationPolicy = CalculableCancellationPolicy | PendingCancellationPolicy

export interface CancellationBasisAmounts {
  participant_total: number
  performance_total: number
}

export interface CalculateCancellationInput {
  performanceDate: string
  performanceStartTime: string
  now: Date | string
  policy: CalculableCancellationPolicy
  basisAmounts: CancellationBasisAmounts
}

export interface CancellationCalculation {
  canCancel: boolean
  performanceStart: Date
  hoursUntilPerformance: number
  feePercentage: number
  feeBasis: CancellationFeeBasis
  feeBasisAmount: number
  feeAmount: number
}

type ReservationPolicyFields = Pick<
  Reservation,
  | 'private_group_id'
  | 'reservation_source'
  | 'cancellation_policy_snapshot_version'
  | 'cancellation_policy_store_id'
  | 'cancellation_policy_performance_type'
  | 'cancellation_policy_deadline_hours'
  | 'cancellation_policy_fees'
  | 'cancellation_policy_fee_basis'
  | 'cancellation_policy_updated_at'
>

function isPerformanceType(value: unknown): value is CancellationPerformanceType {
  return value === 'open' || value === 'private'
}

function isFeeBasis(value: unknown): value is CancellationFeeBasis {
  return value === 'participant_total' || value === 'performance_total'
}

function isFeeRule(value: unknown): value is CancellationFeeRule {
  if (!value || typeof value !== 'object') return false
  const rule = value as Partial<CancellationFeeRule>
  return Number.isFinite(rule.hours_before)
    && Number.isFinite(rule.fee_percentage)
    && typeof rule.description === 'string'
}

function cloneRules(rules: readonly CancellationFeeRule[]): CancellationFeeRule[] {
  return rules.map(rule => ({ ...rule }))
}

function inferLegacyPerformanceType(reservation: ReservationPolicyFields): CancellationPerformanceType {
  if (isPerformanceType(reservation.cancellation_policy_performance_type)) {
    return reservation.cancellation_policy_performance_type
  }
  return reservation.private_group_id != null
    || reservation.reservation_source === RESERVATION_SOURCE.WEB_PRIVATE
    ? 'private'
    : 'open'
}

/**
 * 予約に完全なsnapshotがあればそれだけを使う。migration以前の予約だけは不変の互換既定値を使う。
 * version=1の未完成snapshotはlegacyへ落とさず、計算不能なpendingとして返す。
 */
export function resolveCancellationPolicy(
  reservation: ReservationPolicyFields,
): ResolvedCancellationPolicy {
  const performanceType = inferLegacyPerformanceType(reservation)
  const hasCompleteSnapshot = reservation.cancellation_policy_snapshot_version === 1
    && typeof reservation.cancellation_policy_store_id === 'string'
    && reservation.cancellation_policy_store_id.length > 0
    && isPerformanceType(reservation.cancellation_policy_performance_type)
    && Number.isFinite(reservation.cancellation_policy_deadline_hours)
    && Array.isArray(reservation.cancellation_policy_fees)
    && reservation.cancellation_policy_fees.every(isFeeRule)
    && isFeeBasis(reservation.cancellation_policy_fee_basis)
    && typeof reservation.cancellation_policy_updated_at === 'string'
    && reservation.cancellation_policy_updated_at.length > 0

  if (hasCompleteSnapshot) {
    return {
      status: 'ready',
      performanceType: reservation.cancellation_policy_performance_type!,
      deadlineHours: Math.max(0, reservation.cancellation_policy_deadline_hours!),
      fees: cloneRules(reservation.cancellation_policy_fees!),
      feeBasis: reservation.cancellation_policy_fee_basis!,
      storeId: reservation.cancellation_policy_store_id ?? null,
      policyUpdatedAt: reservation.cancellation_policy_updated_at ?? null,
      snapshotVersion: 1,
      source: 'reservation_snapshot',
    }
  }

  if (reservation.cancellation_policy_snapshot_version === 1) {
    return {
      status: 'pending',
      performanceType,
      deadlineHours: null,
      fees: null,
      feeBasis: null,
      storeId: reservation.cancellation_policy_store_id ?? null,
      policyUpdatedAt: reservation.cancellation_policy_updated_at ?? null,
      snapshotVersion: 1,
      source: 'reservation_snapshot_pending',
      reason: reservation.cancellation_policy_store_id == null
        ? 'store_assignment_pending'
        : 'snapshot_incomplete',
    }
  }

  const isPrivate = performanceType === 'private'
  return {
    status: 'ready',
    performanceType,
    deadlineHours: isPrivate
      ? DEFAULT_PRIVATE_CANCEL_DEADLINE_HOURS
      : DEFAULT_OPEN_CANCEL_DEADLINE_HOURS,
    fees: cloneRules(
      isPrivate ? DEFAULT_PRIVATE_CANCELLATION_FEES : DEFAULT_OPEN_CANCELLATION_FEES,
    ),
    feeBasis: isPrivate ? 'performance_total' : 'participant_total',
    storeId: null,
    policyUpdatedAt: null,
    snapshotVersion: null,
    source: 'legacy_default',
  }
}

/** schedule_events の date / start_time をJSTの瞬間へ変換する。 */
export function parseJstPerformanceStart(date: string, startTime: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new TypeError(`Invalid performance date: ${date}`)
  }
  const timeMatch = startTime.match(/^(\d{2}):(\d{2})(?::(\d{2}))?$/)
  if (!timeMatch) {
    throw new TypeError(`Invalid performance start time: ${startTime}`)
  }
  const [, hour, minute, second = '00'] = timeMatch
  const instant = new Date(`${date}T${hour}:${minute}:${second}+09:00`)
  if (Number.isNaN(instant.getTime())) {
    throw new TypeError(`Invalid JST performance start: ${date} ${startTime}`)
  }
  return instant
}

function resolveFeePercentage(hoursUntilPerformance: number, fees: readonly CancellationFeeRule[]): number {
  let percentage = 0
  const thresholds = [...fees].filter(isFeeRule).sort((a, b) => b.hours_before - a.hours_before)
  for (const threshold of thresholds) {
    if (hoursUntilPerformance <= threshold.hours_before) {
      percentage = threshold.fee_percentage
    }
  }
  return Math.min(100, Math.max(0, percentage))
}

/** オープン/貸切共通の受付可否・料率・円単位金額を副作用なしで計算する。 */
export function calculateCancellation(input: CalculateCancellationInput): CancellationCalculation {
  if (input.policy.status !== 'ready') {
    throw new TypeError('Cancellation policy snapshot is not ready')
  }
  const performanceStart = parseJstPerformanceStart(input.performanceDate, input.performanceStartTime)
  const now = input.now instanceof Date ? input.now : new Date(input.now)
  if (Number.isNaN(now.getTime())) {
    throw new TypeError(`Invalid cancellation calculation time: ${String(input.now)}`)
  }

  const hoursUntilPerformance = (performanceStart.getTime() - now.getTime()) / HOUR_MS
  const canCancel = hoursUntilPerformance >= input.policy.deadlineHours
  const feePercentage = resolveFeePercentage(hoursUntilPerformance, input.policy.fees)
  const rawBasisAmount = input.basisAmounts[input.policy.feeBasis]
  const feeBasisAmount = Number.isFinite(rawBasisAmount) ? Math.max(0, rawBasisAmount) : 0
  const feeAmount = Math.round((feeBasisAmount * feePercentage) / 100)

  return {
    canCancel,
    performanceStart,
    hoursUntilPerformance,
    feePercentage,
    feeBasis: input.policy.feeBasis,
    feeBasisAmount,
    feeAmount,
  }
}

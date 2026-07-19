import {
  DEFAULT_OPEN_CANCELLATION_FEES,
  DEFAULT_OPEN_CANCEL_DEADLINE_HOURS,
  DEFAULT_PRIVATE_CANCELLATION_FEES,
  DEFAULT_PRIVATE_CANCEL_DEADLINE_HOURS,
} from '@/constants/cancellationPolicyDefaults'
import { supabase } from '@/lib/supabase'
import type { CancellationFeeBasis, CancellationFeeRule } from '@/types'

export interface PublicPolicyItem {
  id: string
  content: string
}

export interface PublicOrganizerCancelReason {
  id: string
  content: string
}

export interface PublicCancellationJudgmentRule {
  id: string
  timing: string
  condition: string
  result: string
}

export interface PublicCancellationPolicy {
  organization_id: string
  organization_slug: string
  organization_name: string
  store_id: string
  store_name: string
  store_short_name: string
  is_configured: boolean
  cancellation_policy: string | null
  cancellation_policy_items: PublicPolicyItem[]
  cancellation_deadline_hours: number | null
  cancellation_fees: CancellationFeeRule[]
  cancellation_fee_basis: CancellationFeeBasis | null
  private_cancellation_policy: string | null
  private_cancellation_policy_items: PublicPolicyItem[]
  private_cancellation_deadline_hours: number | null
  private_cancellation_fees: CancellationFeeRule[]
  private_cancellation_fee_basis: CancellationFeeBasis | null
  organizer_cancel_reasons: PublicOrganizerCancelReason[]
  organizer_cancel_refund_note: string | null
  cancellation_judgment_rules: PublicCancellationJudgmentRule[]
  cancellation_notice_note: string | null
  reservation_change_deadline_hours: number | null
  reservation_change_note: string | null
  private_reservation_change_deadline_hours: number | null
  private_reservation_change_note: string | null
  refund_method_note: string | null
  policy_updated_at: string | null
  source: 'rpc' | 'preview_default'
}

export interface FetchPublicCancellationPolicyInput {
  organizationSlug: string
  storeId?: string | null
}

function isFeeBasis(value: unknown): value is CancellationFeeBasis {
  return value === 'participant_total' || value === 'performance_total'
}

function toNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function toText(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null
}

function toArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? value as T[] : []
}

function normalizePublicPolicy(row: Record<string, unknown>): PublicCancellationPolicy {
  return {
    organization_id: String(row.organization_id || ''),
    organization_slug: String(row.organization_slug || ''),
    organization_name: String(row.organization_name || ''),
    store_id: String(row.store_id || ''),
    store_name: String(row.store_name || ''),
    store_short_name: String(row.store_short_name || ''),
    is_configured: row.is_configured === true,
    cancellation_policy: toText(row.cancellation_policy),
    cancellation_policy_items: toArray<PublicPolicyItem>(row.cancellation_policy_items),
    cancellation_deadline_hours: toNumber(row.cancellation_deadline_hours),
    cancellation_fees: toArray<CancellationFeeRule>(row.cancellation_fees),
    cancellation_fee_basis: isFeeBasis(row.cancellation_fee_basis)
      ? row.cancellation_fee_basis
      : null,
    private_cancellation_policy: toText(row.private_cancellation_policy),
    private_cancellation_policy_items: toArray<PublicPolicyItem>(row.private_cancellation_policy_items),
    private_cancellation_deadline_hours: toNumber(row.private_cancellation_deadline_hours),
    private_cancellation_fees: toArray<CancellationFeeRule>(row.private_cancellation_fees),
    private_cancellation_fee_basis: isFeeBasis(row.private_cancellation_fee_basis)
      ? row.private_cancellation_fee_basis
      : null,
    organizer_cancel_reasons: toArray<PublicOrganizerCancelReason>(row.organizer_cancel_reasons),
    organizer_cancel_refund_note: toText(row.organizer_cancel_refund_note),
    cancellation_judgment_rules: toArray<PublicCancellationJudgmentRule>(row.cancellation_judgment_rules),
    cancellation_notice_note: toText(row.cancellation_notice_note),
    reservation_change_deadline_hours: toNumber(row.reservation_change_deadline_hours),
    reservation_change_note: toText(row.reservation_change_note),
    private_reservation_change_deadline_hours: toNumber(row.private_reservation_change_deadline_hours),
    private_reservation_change_note: toText(row.private_reservation_change_note),
    refund_method_note: toText(row.refund_method_note),
    policy_updated_at: toText(row.policy_updated_at),
    source: 'rpc',
  }
}

function isMissingRpcError(error: { code?: string; message?: string }): boolean {
  return error.code === 'PGRST202'
    || error.code === '42883'
    || String(error.message || '').includes('get_public_cancellation_policy')
}

/** RPC未適用のローカルPREVIEWだけで使うことが分かる、明示ラベル付き既定値。 */
export function createPreviewCancellationPolicy(
  organizationSlug: string,
  storeId?: string | null,
): PublicCancellationPolicy {
  return {
    organization_id: 'preview-organization',
    organization_slug: organizationSlug,
    organization_name: 'ローカルプレビュー',
    store_id: storeId || 'preview-store',
    store_name: 'プレビュー店舗（RPC未適用）',
    store_short_name: 'プレビュー店舗',
    is_configured: true,
    cancellation_policy: null,
    cancellation_policy_items: [],
    cancellation_deadline_hours: DEFAULT_OPEN_CANCEL_DEADLINE_HOURS,
    cancellation_fees: DEFAULT_OPEN_CANCELLATION_FEES.map(fee => ({ ...fee })),
    cancellation_fee_basis: 'participant_total',
    private_cancellation_policy: null,
    private_cancellation_policy_items: [],
    private_cancellation_deadline_hours: DEFAULT_PRIVATE_CANCEL_DEADLINE_HOURS,
    private_cancellation_fees: DEFAULT_PRIVATE_CANCELLATION_FEES.map(fee => ({ ...fee })),
    private_cancellation_fee_basis: 'performance_total',
    organizer_cancel_reasons: [],
    organizer_cancel_refund_note: null,
    cancellation_judgment_rules: [],
    cancellation_notice_note: null,
    reservation_change_deadline_hours: null,
    reservation_change_note: null,
    private_reservation_change_deadline_hours: null,
    private_reservation_change_note: null,
    refund_method_note: null,
    policy_updated_at: null,
    source: 'preview_default',
  }
}

export async function fetchPublicCancellationPolicies({
  organizationSlug,
  storeId,
}: FetchPublicCancellationPolicyInput): Promise<PublicCancellationPolicy[]> {
  const slug = organizationSlug.trim()
  if (!slug) return []

  const { data, error } = await supabase.rpc('get_public_cancellation_policy', {
    p_organization_slug: slug,
    p_store_id: storeId || null,
  })

  if (error) {
    if (import.meta.env.DEV && isMissingRpcError(error)) {
      return [createPreviewCancellationPolicy(slug, storeId)]
    }
    throw error
  }

  return toArray<Record<string, unknown>>(data).map(normalizePublicPolicy)
}

export function formatPolicyHours(hours: number): string {
  if (hours === 0) return '開演時刻'
  if (hours >= 24) {
    const days = Math.floor(hours / 24)
    const remainingHours = hours % 24
    return remainingHours === 0 ? `${days}日前` : `${days}日${remainingHours}時間前`
  }
  return `${hours}時間前`
}

export function formatCancellationFeeBasis(basis: CancellationFeeBasis | null): string {
  if (basis === 'performance_total') return '公演価格全額'
  if (basis === 'participant_total') return '予約時の参加料金合計'
  return '設定された料金基準'
}

export function formatCancellationFeePeriod(
  fee: CancellationFeeRule,
  nextFee?: CancellationFeeRule,
): string {
  if (fee.hours_before < 0) return '公演開始後・無断キャンセル'
  const start = `${formatPolicyHours(fee.hours_before)}から`
  if (!nextFee || nextFee.hours_before < 0) return `${start}開演時刻まで`
  return `${start}${formatPolicyHours(nextFee.hours_before)}まで`
}

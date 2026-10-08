/**
 * 主催者の引き継ぎ確認画面（?sheet=handover）の材料（private_group_handover_detail）と、表示・記録のための小さな関数。
 * 仕様の正本: docs/product-spec/マイページ改修_2026-10.md「段階 3」
 */
import type { CancellationFeeBasis, CancellationFeeRule } from '@/types'
import type { PublicCancellationPolicy } from '@/lib/publicCancellationPolicy'

export interface HandoverFixedPolicy {
  version: number
  store_id: string
  store_name: string | null
  performance_type: 'open' | 'private'
  deadline_hours: number
  fees: CancellationFeeRule[]
  fee_basis: CancellationFeeBasis | null
  updated_at: string
}

export interface HandoverDetail {
  request: {
    id: string
    status: 'requested' | 'accepted' | 'declined' | 'cancelled' | 'expired'
    requested_at: string
    expires_at: string
    responded_at: string | null
    from_name: string
    to_name: string
    is_recipient: boolean
    is_requester: boolean
  }
  group: {
    id: string
    status: string
    invite_code: string
    organization_id: string
    organization_slug: string | null
    scenario_master_id: string | null
    preferred_store_ids: string[] | null
    total_price: number | null
    per_person_price: number | null
    target_participant_count: number | null
  }
  scenario: { title: string | null; key_visual_url: string | null } | null
  reservation: {
    id: string
    reservation_number: string | null
    status: string
    participant_count: number | null
    total_price: number | null
    customer_name: string | null
    store_id: string | null
    candidates: Array<{ date: string | null; startTime: string | null; endTime: string | null }>
    requested_store_ids: string[]
    confirmed: { date: string; start_time: string | null; end_time: string | null; store_id: string | null; store_name: string | null } | null
    policy: HandoverFixedPolicy | null
  } | null
  members: Array<{ id: string; name: string; is_organizer: boolean; is_guest: boolean; is_me: boolean }>
  candidate_dates: Array<{ date: string; time_slot: string | null; start_time: string | null; end_time: string | null }>
  /** 宛先本人のときだけ。連絡先の初期値 */
  my_contact: { name: string | null; phone: string | null; email: string | null } | null
}

export type HandoverStage = 'pre_request' | 'requested' | 'confirmed'

const CONFIRMED = ['confirmed', 'checked_in', 'completed']

/** いまの段階（申込前／店舗の返事待ち／確定後） */
export function handoverStage(detail: Pick<HandoverDetail, 'group' | 'reservation'>): HandoverStage {
  if (detail.group.status === 'confirmed' || CONFIRMED.includes(detail.reservation?.status ?? '')) return 'confirmed'
  if (detail.reservation) return 'requested'
  return 'pre_request'
}

export const HANDOVER_STAGE_LABEL: Record<HandoverStage, string> = {
  pre_request: '申込前（日程調整中）',
  requested: '申込済み・店舗の返事待ち',
  confirmed: '確定',
}

/**
 * 注意事項・キャンセルポリシーの店舗の範囲。貸切申込（PrivateBookingRequest）と同じく、店舗が 1 つに決まるときだけその店舗。
 * 確定後は会場、返事待ちは希望店舗が 1 つのとき、申込前は希望店舗が 1 つのとき。
 */
export function handoverPolicyStoreId(detail: Pick<HandoverDetail, 'group' | 'reservation'>): string | null {
  const r = detail.reservation
  if (r?.policy?.store_id) return r.policy.store_id
  if (r?.confirmed?.store_id) return r.confirmed.store_id
  if (r) return r.store_id ?? (r.requested_store_ids.length === 1 ? r.requested_store_ids[0] : null)
  const preferred = detail.group.preferred_store_ids ?? []
  return preferred.length === 1 ? preferred[0] : null
}

/** 同意の記録に残す「画面に出した現在の規定」（予約に固定された規定が無いときだけ使う。固定版は DB 側で記録する） */
export function displayedPolicyRecord(
  storeId: string | null,
  policies: PublicCancellationPolicy[],
  preferredStoreIds: string[],
): Record<string, unknown> {
  const policy = storeId ? policies.find(p => p.store_id === storeId) ?? null : null
  if (!policy) return { store_id: storeId, store_ids: preferredStoreIds, note: storeId ? '公開中の規定を取得できませんでした' : '店舗未確定（店舗ごとの規定を案内）' }
  return {
    store_id: policy.store_id,
    store_name: policy.store_name,
    is_configured: policy.is_configured,
    private_cancellation_deadline_hours: policy.private_cancellation_deadline_hours,
    private_cancellation_fees: policy.private_cancellation_fees,
    private_cancellation_fee_basis: policy.private_cancellation_fee_basis,
    private_cancellation_policy: policy.private_cancellation_policy,
    private_cancellation_policy_items: policy.private_cancellation_policy_items,
    policy_updated_at: policy.policy_updated_at,
  }
}

/** 電話番号（ハイフン・空白を除いて 10〜11 桁）。DB と同じ判定 */
export function isValidHandoverPhone(phone: string): boolean {
  return /^[0-9]{10,11}$/.test(phone.replace(/[-\s]/g, ''))
}

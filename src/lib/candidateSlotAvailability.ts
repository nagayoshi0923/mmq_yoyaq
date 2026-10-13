/**
 * 貸切の候補日時（日付 × 午前・午後・夜）の空き状況。判定は DB（private_booking_candidate_slot_availability /
 * private_group_candidate_slot_availability）だけで行い、画面は結果をそのまま出す。
 * 保存 RPC（private_group_add_candidate_dates）と同じ判定なので、選べると表示した枠は保存でも通る。
 * 仕様の正本: docs/product-spec/貸切受付ルール.md。変更時は同じ PR で更新。
 */
import { supabase } from '@/lib/supabase'
import type { PrivateBookingSlot } from '@/lib/computePrivateBookingSlots'

export type CandidateSlotReason =
  | 'no_store_for_scenario'
  | 'conflict'
  | 'blocked'
  | 'closed'
  | 'slot_not_allowed'
  | 'past_deadline'
  | 'not_recruiting'
  | 'outside_period'
  | 'already_added'

export interface CandidateSlotAvailabilityRow {
  date: string
  time_slot: PrivateBookingSlot['key']
  available: boolean
  reason: CandidateSlotReason | null
  start_time: string | null
  end_time: string | null
  /** conflict の補足（例: 空き 2 時間・必要 5 時間） */
  detail?: string | null
  /** 前後の公演から逆算して標準の開始時刻からずらした */
  adjusted?: boolean | null
}

export interface CandidateSlotAvailability {
  /** 日付ごとの枠（選べない枠も含む。時刻が無い枠は startTime/endTime が空文字） */
  slotsByDate: Record<string, PrivateBookingSlot[]>
  /** `${date}-${label}` → 選べない理由（短い日本語）。無い枠は選べる */
  unavailableReasons: Record<string, string>
}

const SLOT_LABEL: Record<PrivateBookingSlot['key'], PrivateBookingSlot['label']> = {
  morning: '午前',
  afternoon: '午後',
  evening: '夜',
}

export const CANDIDATE_SLOT_REASON_TEXT: Record<CandidateSlotReason, string> = {
  no_store_for_scenario: 'この作品を上演できる店舗が希望店舗にありません',
  conflict: '他の公演と重なります',
  blocked: '受付停止中',
  closed: '営業時間外',
  slot_not_allowed: 'この作品では選べない時間帯です',
  past_deadline: '受付締切を過ぎています',
  not_recruiting: 'この作品は現在貸切を募集していません',
  outside_period: '作品の公演期間外です',
  already_added: '追加済みの候補です',
}

export function candidateSlotReasonText(reason: string | null | undefined): string {
  return (reason && CANDIDATE_SLOT_REASON_TEXT[reason as CandidateSlotReason]) || '選択できません'
}

export function buildCandidateSlotAvailability(rows: CandidateSlotAvailabilityRow[]): CandidateSlotAvailability {
  const slotsByDate: Record<string, PrivateBookingSlot[]> = {}
  const unavailableReasons: Record<string, string> = {}
  for (const row of rows) {
    const label = SLOT_LABEL[row.time_slot]
    if (!label) continue
    const date = String(row.date).slice(0, 10)
    const slot: PrivateBookingSlot = {
      key: row.time_slot,
      label,
      startTime: row.start_time ?? '',
      endTime: row.end_time ?? '',
      ...(row.available && row.adjusted ? { adjusted: true } : {}),
    }
    ;(slotsByDate[date] ??= []).push(slot)
    if (!row.available || !slot.startTime) {
      unavailableReasons[`${date}-${label}`] = candidateSlotReasonText(row.reason) + (row.detail ? `（${row.detail}）` : '')
    }
  }
  return { slotsByDate, unavailableReasons }
}

/** 選べる枠だけ（選択済み候補の再検証や URL からの事前選択に使う） */
export function availableSlotsForDate(availability: CandidateSlotAvailability, date: string): PrivateBookingSlot[] {
  return (availability.slotsByDate[date] ?? []).filter(slot => !availability.unavailableReasons[`${date}-${slot.label}`])
}

export type CandidateSlotAvailabilityTarget =
  | { kind: 'group'; groupId: string }
  | { kind: 'scenario'; organizationId: string; scenarioId: string; storeIds: string[] }

export async function fetchCandidateSlotAvailability(
  target: CandidateSlotAvailabilityTarget,
  from: string,
  to: string,
): Promise<CandidateSlotAvailabilityRow[]> {
  const { data, error } = target.kind === 'group'
    ? await supabase.rpc('private_group_candidate_slot_availability', { p_group_id: target.groupId, p_from: from, p_to: to })
    : await supabase.rpc('private_booking_candidate_slot_availability', {
        p_organization_id: target.organizationId,
        p_scenario_id: target.scenarioId,
        p_store_ids: target.storeIds,
        p_from: from,
        p_to: to,
      })
  if (error) throw error
  return (data ?? []) as CandidateSlotAvailabilityRow[]
}

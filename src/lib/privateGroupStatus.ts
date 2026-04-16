import { supabase } from '@/lib/supabase'
import { logger } from '@/utils/logger'
import type { PrivateGroupStatus } from '@/types'

/**
 * 貸切グループのステータスを更新する。
 * 全ステータス遷移をここに集約することで、遷移の追跡・バリデーションを容易にする。
 *
 * ステータス遷移図:
 *   gathering → booking_requested → confirmed
 *                    ↓ (店舗却下 via RPC)
 *              date_adjusting → booking_requested
 *   any → cancelled
 */

/** 許可される状態遷移マップ。key=現在の状態、value=遷移可能な状態の配列 */
const ALLOWED_TRANSITIONS: Record<PrivateGroupStatus, PrivateGroupStatus[]> = {
  gathering:         ['booking_requested', 'cancelled'],
  date_adjusting:    ['booking_requested', 'cancelled'],
  booking_requested: ['confirmed', 'date_adjusting', 'cancelled'],
  confirmed:         ['cancelled'],
  cancelled:         [],
}

export function isValidTransition(from: PrivateGroupStatus, to: PrivateGroupStatus): boolean {
  return ALLOWED_TRANSITIONS[from]?.includes(to) ?? false
}

export async function updatePrivateGroupStatus(
  groupId: string,
  status: PrivateGroupStatus,
  extra?: { reservationId?: string }
): Promise<void> {
  // 現在の状態を取得してバリデーション
  const { data: current, error: fetchError } = await supabase
    .from('private_groups')
    .select('status')
    .eq('id', groupId)
    .single()

  if (fetchError) throw fetchError

  const currentStatus = current.status as PrivateGroupStatus
  if (!isValidTransition(currentStatus, status)) {
    const msg = `Invalid private group status transition: ${currentStatus} → ${status} (groupId: ${groupId})`
    logger.error(msg)
    throw new Error(msg)
  }

  const data: Record<string, unknown> = { status }
  if (extra?.reservationId) {
    data.reservation_id = extra.reservationId
  }

  const { error } = await supabase
    .from('private_groups')
    .update(data)
    .eq('id', groupId)

  if (error) throw error

  logger.log(`Private group status: ${currentStatus} → ${status} (groupId: ${groupId})`)
}

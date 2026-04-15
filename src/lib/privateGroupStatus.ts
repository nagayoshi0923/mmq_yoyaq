import { supabase } from '@/lib/supabase'
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
export async function updatePrivateGroupStatus(
  groupId: string,
  status: PrivateGroupStatus,
  extra?: { reservationId?: string }
): Promise<void> {
  const data: Record<string, unknown> = { status }
  if (extra?.reservationId) {
    data.reservation_id = extra.reservationId
  }

  const { error } = await supabase
    .from('private_groups')
    .update(data)
    .eq('id', groupId)

  if (error) throw error
}

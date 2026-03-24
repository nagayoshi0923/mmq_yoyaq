import { supabase } from '@/lib/supabase'
import { MAX_MANUAL_PLAY_HISTORY_PER_CUSTOMER } from '@/constants/album'

/** 顧客の手動プレイ履歴件数（登録可否判定用） */
export async function countManualPlayHistoryForCustomer(customerId: string): Promise<number> {
  const { count, error } = await supabase
    .from('manual_play_history')
    .select('*', { count: 'exact', head: true })
    .eq('customer_id', customerId)

  if (error) throw error
  return count ?? 0
}

export function isManualPlayHistoryAtCap(currentCount: number): boolean {
  return currentCount >= MAX_MANUAL_PLAY_HISTORY_PER_CUSTOMER
}

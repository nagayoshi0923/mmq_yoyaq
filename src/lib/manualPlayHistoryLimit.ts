import { customerPlayHistory } from '@/lib/customerPlayHistory'
import { MAX_MANUAL_PLAY_HISTORY_PER_CUSTOMER } from '@/constants/album'

/** 顧客の手動プレイ履歴件数（登録可否判定用） */
export async function countManualPlayHistoryForCustomer(customerId: string): Promise<number> {
  return (await customerPlayHistory.snapshot(customerId)).manual.length
}

export function isManualPlayHistoryAtCap(currentCount: number): boolean {
  return currentCount >= MAX_MANUAL_PLAY_HISTORY_PER_CUSTOMER
}

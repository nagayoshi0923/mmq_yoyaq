/**
 * /api/staff の同時呼び出しをまとめる（Supabase クライアントに依存しない小さな部品）
 */
import { apiClient } from '@/lib/apiClient'
import type { Staff } from '@/types'
import { shareInFlight } from './sharedRequest'

// スケジュール画面では GM 一覧・担当つきスタッフ・作品の担当名の 3 か所が同時に /api/staff を呼ぶ。
// 同時の呼び出しは 1 回の通信を共有する。利用者・組織の切替や保存の後は相乗りしない（sharedRequest.ts）。
export function getAllStaffShared(): Promise<Staff[]> {
  return shareInFlight('GET /api/staff', () => apiClient.get<Staff[]>('/api/staff'))
}

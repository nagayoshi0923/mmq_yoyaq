/**
 * /api/staff の同時呼び出しをまとめる（Supabase クライアントに依存しない小さな部品）
 */
import { apiClient } from '@/lib/apiClient'
import type { Staff } from '@/types'

// スケジュール画面では GM 一覧・担当つきスタッフ・作品の担当名の 3 か所が同時に /api/staff を呼ぶ。
// 同時の呼び出しは 1 回の通信を共有する（終わったら共有をやめるので、保存後の取り直しは新しく取る）。
let staffInFlight: Promise<Staff[]> | null = null
export function getAllStaffShared(): Promise<Staff[]> {
  if (!staffInFlight) {
    const promise = apiClient.get<Staff[]>('/api/staff').finally(() => {
      if (staffInFlight === promise) staffInFlight = null
    })
    staffInFlight = promise
  }
  return staffInFlight
}


import { apiClient } from '@/lib/apiClient'
// 既存の貸切/GM画面で使うレスポンス投影。組織条件と本人IDはサーバーで確定する。
export type GmResponseRow = any
export async function getGmResponses(reservationIds: string[]): Promise<GmResponseRow[]> {
  const rows: GmResponseRow[] = []
  for (let i = 0; i < reservationIds.length; i += 100) {
    const params = new URLSearchParams({ type: 'gm-responses', reservation_ids: reservationIds.slice(i, i + 100).join(',') })
    const result = await apiClient.get<{ responses: GmResponseRow[] }>(`/api/reservations?${params}`)
    rows.push(...result.responses)
  }
  return rows
}
export function getMyGmResponses() {
  return apiClient.get<{ responses: GmResponseRow[]; staffId: string | null; staffName: string }>('/api/reservations?type=gm-responses&mine=true')
}

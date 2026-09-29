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

export async function getGmReadiness(reservationIds: string[]): Promise<Record<string, boolean>> {
  const readiness: Record<string, boolean> = {}
  for (let i = 0; i < reservationIds.length; i += 100) {
    const ids = reservationIds.slice(i, i + 100)
    const params = new URLSearchParams({ type: 'gm-readiness', reservation_ids: ids.join(',') })
    const result = await apiClient.get<{readiness: Record<string, boolean>}>(`/api/reservations?${params}`)
    if (ids.some(id => typeof result.readiness?.[id] !== 'boolean')) throw new Error('GMの担当条件を確認できません')
    Object.assign(readiness, result.readiness)
  }
  return readiness
}

export function saveGmResponse(input: {reservationId: string; staffId: string; candidates: unknown[]; expectedResponse: {id: string; updated_at: string | null} | null; availableCandidates: number[]; responseStatus: string; notes: string | null}) {
  return apiClient.post('/api/reservations?action=gm-response', input)
}

export interface ManualGmResponseBaseline {
  candidates: Array<{order: number; gm_response_index?: number | null}>
  storedCandidates: unknown[]
  responses: Array<{id: string;staff_id?: string;updated_at?: string | null}>
}

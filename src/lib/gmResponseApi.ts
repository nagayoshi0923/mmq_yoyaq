import { apiClient } from '@/lib/apiClient'
import { fetchInChunks } from '@/lib/fetchInChunks'
// 既存の貸切/GM画面で使うレスポンス投影。組織条件と本人IDはサーバーで確定する。
export interface GmResponseRow {
  id: string
  reservation_id: string
  /** スタッフとの内部結合（!inner）で読むため必ずある */
  staff_id: string
  gm_name: string | null
  response_status: string
  available_candidates: number[] | null
  selected_candidate_index: number | null
  notes: string | null
  notified_at: string | null
  response_datetime: string | null
  responded_at: string | null
  updated_at: string | null
  created_at: string | null
  response_type: string | null
  gm_discord_id: string | null
  staff: { id: string; name: string; avatar_color: string | null } | null
  /** 本人の回答一覧（mine）のときだけ付く予約の中身 */
  reservations?: {
    reservation_number: string | null; title: string | null; customer_name: string | null
    candidate_datetimes: {
      candidates: Array<{ order: number; date: string; timeSlot: string; startTime: string; endTime: string; status: string }>
      requestedStores?: Array<{ storeId: string; storeName: string; storeShortName?: string | null }>
    } | null
    status: string; store_id: string | null; created_at: string
    stores: { id: string; name: string; short_name: string | null } | null
  } | null
}
export async function getGmResponses(reservationIds: string[]): Promise<GmResponseRow[]> {
  const pages = await fetchInChunks(reservationIds, async chunk => {
    const params = new URLSearchParams({ type: 'gm-responses', reservation_ids: chunk.join(',') })
    const result = await apiClient.get<{ responses: GmResponseRow[] }>(`/api/reservations?${params}`)
    return result.responses
  })
  return pages.flat()
}
export function getMyGmResponses() {
  return apiClient.get<{ responses: GmResponseRow[]; staffId: string | null; staffName: string }>('/api/reservations?type=gm-responses&mine=true')
}

export async function getGmReadiness(reservationIds: string[]): Promise<Record<string, boolean>> {
  const pages = await fetchInChunks(reservationIds, async ids => {
    const params = new URLSearchParams({ type: 'gm-readiness', reservation_ids: ids.join(',') })
    const result = await apiClient.get<{readiness: Record<string, boolean>}>(`/api/reservations?${params}`)
    if (ids.some(id => typeof result.readiness?.[id] !== 'boolean')) throw new Error('GMの担当条件を確認できません')
    return result.readiness
  })
  return Object.assign({}, ...pages)
}

export function saveGmResponse(input: {reservationId: string; staffId: string; candidates: unknown[]; expectedResponse: {id: string; updated_at: string | null} | null; availableCandidates: number[]; responseStatus: string; notes: string | null}) {
  return apiClient.post('/api/reservations?action=gm-response', input)
}

export interface ManualGmResponseBaseline {
  candidates: Array<{order: number; gm_response_index?: number | null}>
  storedCandidates: unknown[]
  responses: Array<{id: string;staff_id?: string;updated_at?: string | null}>
}

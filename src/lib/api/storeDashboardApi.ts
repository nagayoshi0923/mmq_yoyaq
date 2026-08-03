import { apiClient } from '@/lib/apiClient'

export interface StoreDashboardData {
  date: string
  stores: Array<{ id: string; name: string; short_name: string; notes?: string | null }>
  selected_store_id: string | null
  events: Array<any>
  gm_status: Array<any>
  my_checkin: { id: string; staff_id: string; store_id: string; checked_in_at: string; checked_out_at: string | null } | null
  prompt: { staff_id: string; staff_name: string; event_id: string; scenario: string; start_time: string; store_name: string } | null
}

export const storeDashboardApi = {
  get: (storeId?: string) => apiClient.get<StoreDashboardData>(`/api/store-dashboard${storeId ? `?store_id=${encodeURIComponent(storeId)}` : ''}`),
  action: (body: Record<string, unknown>) => apiClient.post<any>('/api/store-dashboard', body),
}

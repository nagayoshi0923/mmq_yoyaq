import { apiClient } from '@/lib/apiClient'

export interface StoreDashboardData {
  date: string
  stores: Array<{ id: string; name: string; short_name: string; notes?: string | null }>
  selected_store_id: string | null
  events: Array<any>
  gm_status: Array<any>
}

export const storeDashboardApi = {
  get: (storeId?: string) => apiClient.get<StoreDashboardData>(`/api/store-dashboard${storeId ? `?store_id=${encodeURIComponent(storeId)}` : ''}`),
  action: (body: Record<string, unknown>) => apiClient.post<any>('/api/store-dashboard', body),
}

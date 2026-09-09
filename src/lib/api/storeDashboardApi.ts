import { apiClient } from '@/lib/apiClient'

export interface StoreDashboardData {
  date: string
  stores: Array<{ id: string; name: string; short_name: string; notes?: string | null }>
  selected_store_id: string | null
  events: Array<any>
  gm_status: Array<any>
}

export interface StaffCheckinApiResponse {
  available: boolean
  my_checkin: { checked_in_at: string } | null
  staff_name?: string
  performance?: {
    start_time: string
    scenario: string
    store_name: string
  }
}

export const storeDashboardApi = {
  get: (storeId?: string) => apiClient.get<StoreDashboardData>(`/api/store-dashboard${storeId ? `?store_id=${encodeURIComponent(storeId)}` : ''}`),
  action: (body: Record<string, unknown>) => apiClient.post<any>('/api/store-dashboard', body),
  getStaffCheckin: (storeId?: string) => apiClient.get<StaffCheckinApiResponse>(`/api/store-dashboard?resource=staff_checkin${storeId ? `&store_id=${encodeURIComponent(storeId)}` : ''}`),
  staffCheckin: (storeId: string) => apiClient.post<{ id: string; checked_in_at: string }>('/api/store-dashboard', { action: 'staff_checkin', store_id: storeId }),
  cancelStaffCheckin: (storeId: string) => apiClient.post<{ cancelled: true }>('/api/store-dashboard', { action: 'staff_checkin_cancel', store_id: storeId }),
}

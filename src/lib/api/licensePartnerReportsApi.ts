import { apiClient } from '@/lib/apiClient'
import type { PartnerStoreReportResponse } from '@/types'

export const licensePartnerReportsApi = {
  staff(year: number, month?: number | null): Promise<PartnerStoreReportResponse> {
    const params = new URLSearchParams({ scope: 'staff', year: String(year) })
    if (month != null) params.set('month', String(month))
    return apiClient.get<PartnerStoreReportResponse>(`/api/license-partner-reports?${params}`)
  },

  author(year: number, month?: number | null): Promise<PartnerStoreReportResponse> {
    const params = new URLSearchParams({ scope: 'author', year: String(year) })
    if (month != null) params.set('month', String(month))
    return apiClient.get<PartnerStoreReportResponse>(`/api/license-partner-reports?${params}`)
  },
}

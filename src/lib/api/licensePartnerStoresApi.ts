import { apiClient } from '@/lib/apiClient'
import type {
  LicensePartnerContractInput,
  LicensePartnerManagedScenario,
  LicensePartnerStore,
  LicensePartnerStoreDetail,
  LicensePartnerStoreInput,
} from '@/types'

export const licensePartnerStoresApi = {
  list(): Promise<LicensePartnerStore[]> {
    return apiClient.get<LicensePartnerStore[]>('/api/license-partner-stores')
  },

  options(): Promise<{ scenarios: LicensePartnerManagedScenario[] }> {
    return apiClient.get<{ scenarios: LicensePartnerManagedScenario[] }>(
      '/api/license-partner-stores?type=options'
    )
  },

  get(id: string): Promise<LicensePartnerStoreDetail> {
    return apiClient.get<LicensePartnerStoreDetail>(
      `/api/license-partner-stores?type=detail&id=${encodeURIComponent(id)}`
    )
  },

  create(input: LicensePartnerStoreInput): Promise<LicensePartnerStore> {
    return apiClient.post<LicensePartnerStore>('/api/license-partner-stores', input)
  },

  update(id: string, input: Partial<LicensePartnerStoreInput>): Promise<LicensePartnerStore> {
    return apiClient.patch<LicensePartnerStore>(
      `/api/license-partner-stores?id=${encodeURIComponent(id)}`,
      input
    )
  },

  rotateToken(id: string): Promise<LicensePartnerStore> {
    return apiClient.patch<LicensePartnerStore>(
      `/api/license-partner-stores?id=${encodeURIComponent(id)}&type=rotate-token`,
      {}
    )
  },

  delete(id: string): Promise<void> {
    return apiClient.delete<void>(`/api/license-partner-stores?id=${encodeURIComponent(id)}`)
  },

  replaceContracts(id: string, contracts: LicensePartnerContractInput[]): Promise<LicensePartnerStoreDetail> {
    return apiClient.post<LicensePartnerStoreDetail>(
      `/api/license-partner-stores?type=contracts&id=${encodeURIComponent(id)}`,
      { contracts }
    )
  },
}

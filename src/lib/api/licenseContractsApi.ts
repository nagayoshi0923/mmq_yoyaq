import { apiClient } from '@/lib/apiClient'
import type {
  LicenseContractInput,
  StoreScenarioLicenseContract,
  StoreScenarioLicenseContractOptions,
} from '@/types'

export const licenseContractsApi = {
  list(): Promise<StoreScenarioLicenseContract[]> {
    return apiClient.get<StoreScenarioLicenseContract[]>('/api/license-contracts')
  },

  options(): Promise<StoreScenarioLicenseContractOptions> {
    return apiClient.get<StoreScenarioLicenseContractOptions>('/api/license-contracts?type=options')
  },

  create(input: LicenseContractInput): Promise<StoreScenarioLicenseContract> {
    return apiClient.post<StoreScenarioLicenseContract>('/api/license-contracts', input)
  },

  update(id: string, input: Partial<LicenseContractInput>): Promise<StoreScenarioLicenseContract> {
    return apiClient.patch<StoreScenarioLicenseContract>(
      `/api/license-contracts?id=${encodeURIComponent(id)}`,
      input
    )
  },

  delete(id: string): Promise<void> {
    return apiClient.delete<void>(`/api/license-contracts?id=${encodeURIComponent(id)}`)
  },
}

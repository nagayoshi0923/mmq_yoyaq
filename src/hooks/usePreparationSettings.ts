import { useCallback } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '@/lib/apiClient'
import { useOrganization } from './useOrganization'
import { resolvePreparationMinutes, type PreparationSettings, type PreparationContext } from '../../supabase/functions/_shared/preparation-settings'
export function usePreparationSettings() {
  const { organizationId } = useOrganization()
  const client = useQueryClient()
  const queryKey = ['preparation-settings', organizationId]
  const queryFn = () => apiClient.get<PreparationSettings>('/api/schedule?type=preparation-settings')
  const query = useQuery({ queryKey, queryFn, enabled: Boolean(organizationId), staleTime: 30000 })
  const resolve = useCallback((context: PreparationContext) => query.data ? resolvePreparationMinutes(query.data,context) : undefined, [query.data])
  const fetch = useCallback(async () => {
    if (!organizationId) throw new Error('組織情報が必要です')
    const data = await client.fetchQuery({ queryKey: ['preparation-settings', organizationId], queryFn: () => apiClient.get<PreparationSettings>('/api/schedule?type=preparation-settings'), staleTime: 0 })
    return (context: PreparationContext) => resolvePreparationMinutes(data,context)
  }, [client, organizationId])
  return { ...query, resolve, fetch }
}

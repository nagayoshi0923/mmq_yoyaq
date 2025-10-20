import { useQueryClient } from '@tanstack/react-query'
import { scenarioApi } from '@/lib/api'
import { staffApi } from '@/lib/api'

export function usePrefetch() {
  const queryClient = useQueryClient()

  const prefetchScenario = (scenarioId: string) => {
    queryClient.prefetchQuery({
      queryKey: ['scenario', scenarioId],
      queryFn: () => scenarioApi.getById?.(scenarioId),
      staleTime: 5 * 60 * 1000,
    })
  }

  const prefetchStaff = (staffId: string) => {
    queryClient.prefetchQuery({
      queryKey: ['staff', staffId],
      queryFn: () => staffApi.getById?.(staffId),
      staleTime: 5 * 60 * 1000,
    })
  }

  return { prefetchScenario, prefetchStaff }
}


import { useQueryClient } from '@tanstack/react-query'
import { scenarioApi } from '@/lib/api'
import { staffApi } from '@/lib/api'

export function usePrefetch() {
  const queryClient = useQueryClient()

  const prefetchScenario = (scenarioId: string) => {
    queryClient.prefetchQuery({
      queryKey: ['scenario', scenarioId],
      queryFn: () => scenarioApi.getById?.(scenarioId),
      staleTime: 30 * 60 * 1000, // 30分間キャッシュ（マスターデータ）
    })
  }

  const prefetchStaff = (staffId: string) => {
    queryClient.prefetchQuery({
      queryKey: ['staff', staffId],
      queryFn: () => staffApi.getById?.(staffId),
      staleTime: 10 * 60 * 1000, // 10分間キャッシュ（マスターデータ）
    })
  }

  return { prefetchScenario, prefetchStaff }
}


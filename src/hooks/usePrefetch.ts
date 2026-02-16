import { useQueryClient } from '@tanstack/react-query'
import { scenarioApi } from '@/lib/api'
import { staffApi } from '@/lib/api'

export function usePrefetch() {
  const queryClient = useQueryClient()

  /**
   * シナリオ基本情報をプリフェッチ（軽量、ホバー時に実行）
   * 詳細ページの初期表示に必要な最小限のデータを先読み
   */
  const prefetchScenario = (scenarioId: string, organizationSlug?: string) => {
    // シナリオ基本情報をプリフェッチ
    queryClient.prefetchQuery({
      queryKey: ['scenario', scenarioId],
      queryFn: () => scenarioApi.getById?.(scenarioId),
      staleTime: 30 * 60 * 1000, // 30分間キャッシュ
    })
  }

  const prefetchStaff = (staffId: string) => {
    queryClient.prefetchQuery({
      queryKey: ['staff', staffId],
      queryFn: () => staffApi.getById?.(staffId),
      staleTime: 10 * 60 * 1000, // 10分間キャッシュ
    })
  }

  return { prefetchScenario, prefetchStaff }
}


import { useQueryClient } from '@tanstack/react-query'
import { scenarioApi } from '@/lib/api'
import { staffApi } from '@/lib/api'
import { scheduleEventKeys, fetchScheduleEventsForMonth } from './useScheduleEventsQuery'

export function usePrefetch() {
  const queryClient = useQueryClient()

  /**
   * シナリオ基本情報をプリフェッチ（軽量、ホバー時に実行）
   * 詳細ページの初期表示に必要な最小限のデータを先読み
   */
  const prefetchScenario = (scenarioId: string, organizationSlug?: string) => {
    queryClient.prefetchQuery({
      queryKey: ['scenario', scenarioId],
      queryFn: () => scenarioApi.getById?.(scenarioId),
      staleTime: 30 * 60 * 1000,
    })
  }

  const prefetchStaff = (staffId: string) => {
    queryClient.prefetchQuery({
      queryKey: ['staff', staffId],
      queryFn: () => staffApi.getById?.(staffId),
      staleTime: 10 * 60 * 1000,
    })
  }

  /**
   * スケジュール画面のデータをプリフェッチ。
   * ダッシュボード表示中にバックグラウンドで先読みしておくことで
   * スケジュール画面を開いたときに即表示できる。
   * キャッシュ済みなら何もしない（prefetchQuery は重複実行しない）。
   */
  const prefetchSchedule = (date?: Date) => {
    const target = date ?? new Date()
    const year = target.getFullYear()
    const month = target.getMonth() + 1
    queryClient.prefetchQuery({
      queryKey: scheduleEventKeys.month(year, month),
      queryFn: () => fetchScheduleEventsForMonth(year, month),
      staleTime: Infinity,
    })
  }

  return { prefetchScenario, prefetchStaff, prefetchSchedule }
}


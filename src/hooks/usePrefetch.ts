import { useQueryClient } from '@tanstack/react-query'
import { scenarioApi, staffApi, storeApi } from '@/lib/api'
import { assignmentApi } from '@/lib/assignmentApi'
import { scheduleEventKeys, fetchScheduleEventsForMonth } from './useScheduleEventsQuery'

export function usePrefetch() {
  const queryClient = useQueryClient()

  /** シナリオ詳細をプリフェッチ（カード hover 時などに使用） */
  const prefetchScenario = (scenarioId: string) => {
    queryClient.prefetchQuery({
      queryKey: ['scenario', scenarioId],
      queryFn: () => scenarioApi.getById?.(scenarioId),
      staleTime: 30 * 60 * 1000,
    })
  }

  /** スタッフ詳細をプリフェッチ */
  const prefetchStaff = (staffId: string) => {
    queryClient.prefetchQuery({
      queryKey: ['staff', staffId],
      queryFn: () => staffApi.getById?.(staffId),
      staleTime: 10 * 60 * 1000,
    })
  }

  /** スケジュール月データをプリフェッチ */
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

  /**
   * 管理ページのマスターデータをまとめて先読み。
   * アイドル時に呼ぶことで、スタッフ管理・シナリオ管理などを
   * 開いたときにロード不要にする。
   * キャッシュ済みなら何もしない（prefetchQuery は重複実行しない）。
   */
  const prefetchAdminPages = async () => {
    // 店舗一覧（スタッフ管理・売上管理・スケジュールで共通利用）
    queryClient.prefetchQuery({
      queryKey: ['staff-page-stores'],
      queryFn: () => storeApi.getAll(),
      staleTime: 30 * 60 * 1000,
    })

    // シナリオ一覧（スタッフ管理・シナリオ管理で共通利用）
    queryClient.prefetchQuery({
      queryKey: ['staff-page-scenarios'],
      queryFn: () => scenarioApi.getAll(),
      staleTime: 30 * 60 * 1000,
    })

    // スタッフ一覧（スタッフ管理ページ）
    queryClient.prefetchQuery({
      queryKey: ['staff'],
      queryFn: async () => {
        const staffData = await staffApi.getAll()
        const staffIds = staffData.map(s => s.id)
        const assignmentMap = await assignmentApi.getBatchStaffAssignments(staffIds).catch(() =>
          new Map<string, { gmScenarios: string[]; experiencedScenarios: string[]; gm_scenario_modes: Record<string, 'main_only' | 'sub_only' | 'main_and_sub'> }>()
        )
        return staffData.map(staff => {
          const a = assignmentMap.get(staff.id) ?? { gmScenarios: [], experiencedScenarios: [], gm_scenario_modes: {} }
          return { ...staff, special_scenarios: a.gmScenarios, experienced_scenarios: a.experiencedScenarios, gm_scenario_modes: a.gm_scenario_modes }
        })
      },
      staleTime: 30 * 1000,
    })
  }

  return { prefetchScenario, prefetchStaff, prefetchSchedule, prefetchAdminPages }
}

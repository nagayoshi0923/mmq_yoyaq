/**
 * 全体トップの新作一覧のカードに出す、作品ごとの次の公開の公演（全組織で最大 2 件。55 日より先でも）。
 * 公開・募集停止・独自休日の料金は platformPerformancesFromEvents、締切は isBookableNow（検索・カードと同じ判定）。結果は新作のカードだけに使う
 */
import { useMemo } from 'react'
import { useQueries } from '@tanstack/react-query'
import { publicBookingListReadApi } from '@/lib/api/publicBookingReadApi'
import { isBookableNow, type PublicPerformance } from '@/lib/publicPerformanceSearch'
import { collectNextValid } from '@/components/public-top/newArrivalNextEvents'
import { platformPerformancesFromEvents, type PlatformPerformanceContext } from './platformTopData'

type EventRow = Parameters<typeof platformPerformancesFromEvents>[0][number]

export function usePlatformNewArrivalNext(input: { scenarioIds: readonly string[]; today: string; context: PlatformPerformanceContext | null }): PublicPerformance[] {
  const { scenarioIds, today, context } = input
  const results = useQueries({
    queries: scenarioIds.map((id) => ({
      queryKey: ['platform-new-arrival-next', id, today],
      queryFn: () => collectNextValid<EventRow, PublicPerformance>(
        (offset, limit) => publicBookingListReadApi.listNextPublicOpenEvents(id, null, today, offset, limit) as PromiseLike<{ data: EventRow[] | null; error: unknown }>,
        async (rows) => (await platformPerformancesFromEvents(rows, context!)).filter((p) => isBookableNow(p, Date.now())),
      ),
      enabled: !!context,
      staleTime: 2 * 60 * 1000,
      gcTime: 10 * 60 * 1000,
      retry: 1,
    })),
  })
  const dataKey = results.map((r) => r.dataUpdatedAt).join(',')
  // 作品・取得の更新時刻で作り直す（別の作品で更新時刻が同じでも前の結果を残さない）
  const queryKey = `${today}|${scenarioIds.join(',')}`
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => results.flatMap((r) => r.data ?? []), [queryKey, dataKey])
}

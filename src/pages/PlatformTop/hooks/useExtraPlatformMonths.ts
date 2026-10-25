/**
 * 全体トップで、最初に読む 55 日より先の公演を、「もっと見る」で要る月だけ 1 か月ずつ読む（2026-10-25）。
 * 組織・作品・店舗は最初の取得のものを使い、読み直さない。月ごとに「読み込み中／読めなかった／読めた」を返す。
 */
import { useMemo } from 'react'
import { useQueries } from '@tanstack/react-query'
import { publicBookingListReadApi } from '@/lib/api/publicBookingReadApi'
import type { PublicPerformance } from '@/lib/publicPerformanceSearch'
import { monthEnd } from '@/pages/PublicBookingTop/utils/bookingRange'
import { platformPerformancesFromEvents, type PlatformPerformanceContext } from './platformTopData'

type ExtraMonthStatus = 'loading' | 'error' | 'ready'

async function fetchMonth(month: string, today: string, loadedUntil: string, ctx: PlatformPerformanceContext) {
  // 最初の 55 日と重ならないよう、読んだ期間の翌日から（今月なら今日から）
  const first = `${month}-01`
  const from = [first, today, loadedUntil < first ? first : nextDay(loadedUntil)].sort().at(-1)!
  const { data, error } = await publicBookingListReadApi.listAllPublicEventsInRange(from, monthEnd(month))
  if (error) throw error
  return platformPerformancesFromEvents(data ?? [], ctx)
}

function nextDay(ymd: string): string {
  const [y, m, d] = ymd.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10)
}

export function useExtraPlatformMonths(input: { months: string[]; today: string; loadedUntil: string; context: PlatformPerformanceContext | null }) {
  const { months, today, loadedUntil, context } = input
  const results = useQueries({
    queries: months.map((month) => ({
      queryKey: ['platform-extra-month', today, loadedUntil, month],
      queryFn: () => fetchMonth(month, today, loadedUntil, context!),
      enabled: !!context,
      staleTime: 2 * 60 * 1000,
      gcTime: 10 * 60 * 1000,
      retry: 1,
    })),
  })
  const dataKey = results.map((r) => r.dataUpdatedAt).join(',')
  const performances = useMemo<PublicPerformance[]>(
    () => results.flatMap((r) => r.data ?? []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [dataKey],
  )
  const state: ExtraMonthStatus = results.some((r) => r.isError) ? 'error' : results.some((r) => !r.data) ? 'loading' : 'ready'
  const retry = () => results.forEach((r) => { if (r.isError) void r.refetch() })
  return { performances, state, retry }
}

/**
 * 店舗トップで、最初に読む 3 か月（useBookingData）より先の月の公演を、要る月だけ 1 か月ずつ読む
 * （2026-10-25 社長報告「カレンダーが 12 月以降に切り替えられない」・「もっと見る」）。
 * - 月ごとに別の取得（キャッシュも月ごと）。戻ったり同じ月を開き直したりしても読み直さない（2 分は新しいまま）
 * - 作品・店舗の情報は最初の取得のものを使い、読み直さない
 * - 月ごとに「読み込み中／読み込めなかった／読めた」を返す（読めなかった月を「公演なし」と見せない）
 */
import { useMemo } from 'react'
import { useQueries, useQueryClient } from '@tanstack/react-query'
import { publicBookingListReadApi, publicBookingReadApi } from '@/lib/api/publicBookingReadApi'
import type { StoreRecruitmentPausePeriod } from '@/lib/storeRecruitmentPause'
import { monthEnd } from '../utils/bookingRange'
import { buildPublicEvents, type EnrichedPublicEvent, type PublicEventRow, type PublicScenarioRow, type PublicStoreRow } from './useBookingData'

export type ExtraMonthStatus = 'loading' | 'error' | 'ready'
export { browseLimits, extraMonthsToLoad, monthEnd, monthsBetween, requiredUntil, UNKNOWN_LATEST_MONTHS } from '../utils/bookingRange'




async function fetchMonth(organizationId: string, month: string, today: string) {
  // 今月を読み足すとき（最初の取得に失敗したとき）は今日から
  const from = `${month}-01` < today ? today : `${month}-01`
  const { data, error } = await publicBookingListReadApi.listPublicEventsInRange(from, monthEnd(month), organizationId)
  if (error) throw error
  const rows = (data ?? []) as PublicEventRow[]
  const storeIds = [...new Set(rows.map((r) => r.store_id).filter(Boolean))] as string[]
  let pauses: StoreRecruitmentPausePeriod[] = []
  if (storeIds.length > 0) {
    const { data: pauseRows, error: pauseError } = await publicBookingReadApi.listPerformancePauses(storeIds)
    if (pauseError) throw pauseError
    pauses = (pauseRows ?? []) as StoreRecruitmentPausePeriod[]
  }
  return { rows, pauses }
}

export function useExtraBookingMonths(input: {
  organizationId: string | null
  months: string[]
  today: string
  /** 最初の取得の作品・店舗（作品の行が無い間＝前回の控えを出している間は読まない） */
  scenarioRows: PublicScenarioRow[] | null
  stores: PublicStoreRow[]
}) {
  const { organizationId, months, today, scenarioRows, stores } = input
  const enabled = !!organizationId && !!scenarioRows
  const results = useQueries({
    queries: months.map((month) => ({
      queryKey: ['booking-extra-month', organizationId, month],
      queryFn: () => fetchMonth(organizationId!, month, today),
      enabled,
      staleTime: 2 * 60 * 1000,
      gcTime: 10 * 60 * 1000,
      retry: 1,
    })),
  })

  const dataKey = results.map((r) => r.dataUpdatedAt).join(',')
  const merged = useMemo(() => {
    const events: EnrichedPublicEvent[] = []
    const blocked: PublicEventRow[] = []
    if (!scenarioRows) return { events, blocked }
    for (const r of results) {
      if (!r.data) continue
      const built = buildPublicEvents(r.data.rows, scenarioRows, stores, r.data.pauses)
      events.push(...built.enriched)
      blocked.push(...built.blocked)
    }
    return { events, blocked }
    // results は毎回新しい配列なので、取得の更新時刻で作り直す
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataKey, scenarioRows, stores])

  const status = useMemo(() => {
    const map = new Map<string, ExtraMonthStatus>()
    months.forEach((month, i) => {
      const r = results[i]
      map.set(month, r.data ? 'ready' : r.isError ? 'error' : 'loading')
    })
    return map
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [months.join(','), results.map((r) => `${r.status}:${r.dataUpdatedAt}`).join(',')])

  const retry = (month: string) => { const i = months.indexOf(month); if (i >= 0) void results[i].refetch() }

  // 表示中の月が親に伝わる前（1 回の描画のあいだ）でも、読み済みの月は「読み込み中」と出さない
  const queryClient = useQueryClient()
  const statusOf = (month: string): ExtraMonthStatus =>
    status.get(month) ?? (queryClient.getQueryData(['booking-extra-month', organizationId, month]) ? 'ready' : 'loading')

  return { events: merged.events, blocked: merged.blocked, status, statusOf, retry }
}


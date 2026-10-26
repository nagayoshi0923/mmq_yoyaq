/**
 * 店舗トップの新作一覧のカードに出す、作品ごとの次の公開の公演（最大 2 件。最初の 3 か月より先でも）。
 * 公開・貸切・募集停止は buildPublicEvents、締切は isBookableNow（検索・カードと同じ判定）。結果は新作のカードだけに使う
 */
import { useMemo } from 'react'
import { useQueries } from '@tanstack/react-query'
import { publicBookingListReadApi, publicBookingReadApi } from '@/lib/api/publicBookingReadApi'
import { isBookableNow } from '@/lib/publicPerformanceSearch'
import type { StoreRecruitmentPausePeriod } from '@/lib/storeRecruitmentPause'
import { collectNextValid, nextEventsFromQueries, nextQueriesKey, type NextEventsState } from '@/components/public-top/newArrivalNextEvents'
import { buildPublicPerformance } from '../utils/performanceRows'
import { buildPublicEvents, type EnrichedPublicEvent, type PublicEventRow, type PublicScenarioRow, type PublicStoreRow } from './useBookingData'

async function fetchNext(organizationId: string, scenarioId: string, today: string, scenarioRows: PublicScenarioRow[], stores: PublicStoreRow[]) {
  const storesById = new Map(stores.map((s) => [s.id, s]))
  return collectNextValid<PublicEventRow, EnrichedPublicEvent>(
    (offset, limit) => publicBookingListReadApi.listNextPublicOpenEvents(scenarioId, organizationId, today, offset, limit) as PromiseLike<{ data: PublicEventRow[] | null; error: unknown }>,
    async (rows) => {
      const storeIds = [...new Set(rows.map((r) => r.store_id).filter(Boolean))] as string[]
      let pauses: StoreRecruitmentPausePeriod[] = []
      if (storeIds.length > 0) {
        const { data, error } = await publicBookingReadApi.listPerformancePauses(storeIds)
        if (error) throw error
        pauses = (data ?? []) as StoreRecruitmentPausePeriod[]
      }
      const org = { id: organizationId, slug: '', name: '' }
      return buildPublicEvents(rows, scenarioRows, stores, pauses).enriched.filter((e) => {
        const p = buildPublicPerformance(e, e.scenario_data, e.store_id ? storesById.get(e.store_id) : null, org, null)
        return !!p && isBookableNow(p, Date.now())
      })
    },
  )
}

export function useNewArrivalNextEvents(input: {
  organizationId: string | null
  scenarioIds: readonly string[]
  today: string
  /** 最初の取得の作品・店舗（作品の行が無い間＝前回の控えを出している間は読まない） */
  scenarioRows: PublicScenarioRow[] | null
  stores: PublicStoreRow[]
}): { events: EnrichedPublicEvent[]; stateOf: (scenarioId: string) => NextEventsState; retry: (scenarioId: string) => void } {
  const { organizationId, scenarioIds, today, scenarioRows, stores } = input
  const results = useQueries({
    queries: scenarioIds.map((id) => ({
      queryKey: ['new-arrival-next', organizationId, id, today],
      queryFn: () => fetchNext(organizationId!, id, today, scenarioRows!, stores),
      enabled: !!organizationId && !!scenarioRows,
      staleTime: 2 * 60 * 1000,
      gcTime: 10 * 60 * 1000,
      retry: 1,
      // 再訪のたびに取り直す（全体の既定は refetchOnMount: false。離れている間の取消・非公開を反映する。点検 R1247-A）
      refetchOnMount: 'always' as const,
    })),
  })
  // 組織・作品・取得の状態で作り直す（別の組織・作品で更新時刻が同じでも前の結果を残さない）
  const memoKey = `${organizationId}|${today}|${scenarioIds.join(',')}|${nextQueriesKey(results)}`
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const { events, state } = useMemo(() => nextEventsFromQueries(scenarioIds, results), [memoKey])
  const stateOf = (id: string): NextEventsState => state.get(id) ?? 'loading'
  const retry = (id: string) => { const i = scenarioIds.indexOf(id); if (i >= 0) void results[i].refetch() }
  return { events, stateOf, retry }
}

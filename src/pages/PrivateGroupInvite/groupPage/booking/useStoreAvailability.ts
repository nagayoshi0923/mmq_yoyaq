/**
 * 申込シートの「この日は空きなし」: 希望店舗ごとに、候補日の空きを読む。
 * 判定は候補日カレンダーと同じ DB の private_booking_candidate_slot_availability（#1021/#1023。画面では計算しない）を
 * 店舗 1 つずつ呼ぶ。読めないときは null（灰色にしない。送信時の確認と DB に任せる）。
 */
import { useQuery } from '@tanstack/react-query'
import { fetchCandidateSlotAvailability, type CandidateSlotAvailabilityRow } from '@/lib/candidateSlotAvailability'
import { logger } from '@/utils/logger'
import { availabilityWindows, toStoreAvailability, type StoreAvailability } from './requestSheetModel'

export function useStoreAvailability(input: {
  organizationId: string | null | undefined
  scenarioMasterId: string | null | undefined
  storeIds: ReadonlyArray<string>
  dates: ReadonlyArray<string>
}): { availability: StoreAvailability | null; loading: boolean } {
  const { organizationId, scenarioMasterId } = input
  const storeIds = [...input.storeIds].sort()
  const windows = availabilityWindows(input.dates)
  const enabled = Boolean(organizationId && scenarioMasterId && storeIds.length && windows.length)
  const query = useQuery({
    queryKey: ['request-sheet-store-availability', organizationId, scenarioMasterId, storeIds.join(','), windows.map(w => `${w.from}~${w.to}`).join(',')],
    enabled,
    staleTime: 60 * 1000,
    queryFn: async (): Promise<StoreAvailability | null> => {
      try {
        const entries = await Promise.all(storeIds.map(async storeId => {
          const parts = await Promise.all(windows.map(w => fetchCandidateSlotAvailability(
            { kind: 'scenario', organizationId: organizationId as string, scenarioId: scenarioMasterId as string, storeIds: [storeId] },
            w.from,
            w.to,
          )))
          return [storeId, parts.flat()] as [string, CandidateSlotAvailabilityRow[]]
        }))
        return toStoreAvailability(Object.fromEntries(entries))
      } catch (err) {
        logger.warn('[request-sheet] 店舗ごとの空きを読めませんでした', err)
        return null
      }
    },
  })
  return { availability: query.data ?? null, loading: enabled && query.isLoading }
}

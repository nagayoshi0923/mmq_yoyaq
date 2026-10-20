import { useQuery } from '@tanstack/react-query'
import { privateBookingSlotReadApi, scheduleHookReadApi } from '@/lib/api/scheduleHookReadApi'
import { getPublicPrivateBookingSlotOptions } from '@/lib/publicPrivateBookingSlots'
import type { BusinessHoursSettingRow } from '@/lib/privateGroupCandidateSlots'
import type { PrivateBookingBlockedSlotRow } from '@/lib/privateBookingBlockedSlotAvailability'
import { formatDateJST } from '@/utils/dateUtils'
import { fetchPrivateBookingHorizonDays, isBeyondPrivateBookingHorizon, privateBookingHorizonMaxYmd } from '@/lib/privateBookingHorizon'

/**
 * カレンダーとリストが同じ公開受付情報を使用する。取得失敗・取得中は申込枠を出さない。
 * 組織の「貸切を受け付ける範囲」（今日から N 日先まで。I21）より先の日は申込枠を出さない（月送りはできる）。
 */
export function usePublicPrivateBookingSlots(organizationId: string | null | undefined, storeIds: string[], month: Date) {
  const ids = [...new Set(storeIds)].sort()
  const start = formatDateJST(new Date(month.getFullYear(), month.getMonth(), 1))
  const end = formatDateJST(new Date(month.getFullYear(), month.getMonth() + 1, 0))
  const { data, isError, isFetching } = useQuery({
    queryKey: ['public-private-slots', organizationId, ids, start, end],
    enabled: !!organizationId && ids.length > 0,
    staleTime: 0,
    refetchOnMount: 'always',
    refetchInterval: 30_000,
    queryFn: async () => {
      const eventStart = formatDateJST(new Date(month.getFullYear(), month.getMonth(), -1))
      const eventEnd = formatDateJST(new Date(month.getFullYear(), month.getMonth() + 1, 2))
      const [hours, blocked, events, holidays, horizonDays] = await Promise.all([
        privateBookingSlotReadApi.listBusinessHours(ids),
        privateBookingSlotReadApi.getPublicAvailability({ p_organization_id: organizationId!, p_store_ids: ids, p_start_date: start, p_end_date: end }),
        privateBookingSlotReadApi.listAvailabilityEvents(organizationId!, ids, eventStart, eventEnd),
        scheduleHookReadApi.getPublicCustomHolidays(organizationId!),
        fetchPrivateBookingHorizonDays({ organizationId }),
      ])
      for (const result of [hours, blocked, events, holidays]) if (result.error) throw result.error
      return {
        hours: new Map((hours.data ?? []).map(row => [row.store_id, row as BusinessHoursSettingRow])),
        blocked: (blocked.data ?? []) as PrivateBookingBlockedSlotRow[],
        events: events.data ?? [],
        holidays: holidays.data?.[0]?.custom_holidays ?? [],
        horizonDays,
      }
    },
  })
  const getOptions = (date: string, slot: 'morning' | 'afternoon' | 'evening', candidateStoreIds = ids) => {
    if (!data || isError || isFetching || date < start || date > end) return []
    if (isBeyondPrivateBookingHorizon(date, data.horizonDays)) return []
    return getPublicPrivateBookingSlotOptions(date, slot, candidateStoreIds, data.hours, data.blocked, data.events, date => data.holidays.includes(date))
  }
  /** 表示中の月の一部が受付範囲より先なら、その最後の日（YYYY-MM-DD）。読込前・範囲内なら null */
  const horizonEnd = data && end > privateBookingHorizonMaxYmd(data.horizonDays) ? privateBookingHorizonMaxYmd(data.horizonDays) : null
  return Object.assign(getOptions, { horizonDays: data?.horizonDays ?? null, horizonEnd })
}

import { useMemo } from 'react'
import { isPublicRegularStore, storeDisplayName } from '@/lib/publicStoreName'
import { isBookableNow, type PublicPerformance } from '@/lib/publicPerformanceSearch'
import type { StoreOption } from '@/components/public-top/StorePicker'
import { buildPublicPerformance } from '../utils/performanceRows'
import { useCustomHolidays } from '@/hooks/useCustomHolidays'
import type { EnrichedPublicEvent, PublicStoreRow } from './useBookingData'

interface Params {
  allEvents: EnrichedPublicEvent[]
  stores: PublicStoreRow[]
  organizationId: string | null
  organizationSlug: string
  organizationName: string | null
  nowMs: number
}

/** 店舗トップの公演（お客様向け 1 件ずつ）・店舗の選択肢・作品ごとの次回公演日 */
export function useStoreTopPerformances({ allEvents, stores, organizationId, organizationSlug, organizationName, nowMs }: Params) {
  const storesById = useMemo(() => new Map(stores.map((s) => [s.id, s])), [stores])

  // 組織の独自休日も土日祝料金にする（予約確認の画面と同じ。2026-10-25 社長報告）
  // 読み込み中・読み込めなかったときは null（平日の公演の料金は出さない）
  const holidays = useCustomHolidays({ organizationId: organizationId ?? undefined })
  const isCustomHoliday = holidays.isLoading || holidays.error ? null : holidays.isCustomHoliday

  const performances = useMemo<PublicPerformance[]>(() => {
    const org = { id: organizationId ?? '', slug: organizationSlug, name: organizationName ?? '' }
    return allEvents
      .map((e) => buildPublicPerformance(e, e.scenario_data, e.store_id ? storesById.get(e.store_id) : null, org, isCustomHoliday))
      .filter((p): p is PublicPerformance => p !== null)
  }, [allEvents, storesById, organizationId, organizationSlug, organizationName, isCustomHoliday])

  /** 店舗の選択肢: 常設の店舗＋公演のある会場（オフィス等）。臨時会場は日替わりなので出さない */
  const storeOptions = useMemo<StoreOption[]>(() => {
    const withEvents = new Set(performances.map((p) => p.store_id).filter(Boolean))
    return stores
      .filter((s) => !s.is_temporary && s.status !== 'inactive' && (isPublicRegularStore(s) || withEvents.has(s.id)))
      .map((s) => ({ id: s.id, label: storeDisplayName(s, { organizationName }) }))
  }, [stores, performances, organizationName])

  const nextDates = useMemo(() => {
    const map = new Map<string, string>()
    for (const p of performances) {
      if (p.available_seats <= 0 || !isBookableNow(p, nowMs)) continue
      const prev = map.get(p.scenario_id)
      if (!prev || p.date < prev) map.set(p.scenario_id, p.date)
    }
    return map
  }, [performances, nowMs])

  return { performances, storeOptions, nextDates }
}

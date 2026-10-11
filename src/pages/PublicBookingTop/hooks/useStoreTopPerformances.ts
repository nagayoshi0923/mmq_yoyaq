import { useMemo } from 'react'
import { isPublicRegularStore, storeDisplayName } from '@/lib/publicStoreName'
import { isBookableNow, type PublicPerformance } from '@/lib/publicPerformanceSearch'
import type { StoreOption } from '@/components/public-top/StorePicker'
import { buildPublicPerformance } from '../utils/performanceRows'
import type { PrivateBlock } from '@/lib/publicTimetable'
import type { EnrichedPublicEvent, PublicEventRow, PublicStoreRow } from './useBookingData'

interface Params {
  allEvents: EnrichedPublicEvent[]
  /** 貸切などで埋まった枠（公開ビューの行。中身は使わず「貸切」とだけ見せる） */
  blockedSlots: PublicEventRow[]
  stores: PublicStoreRow[]
  organizationId: string | null
  organizationSlug: string
  organizationName: string | null
  nowMs: number
}

/** 店舗トップの公演（お客様向け 1 件ずつ）・店舗の選択肢・作品ごとの次回公演日 */
export function useStoreTopPerformances({ allEvents, blockedSlots, stores, organizationId, organizationSlug, organizationName, nowMs }: Params) {
  const storesById = useMemo(() => new Map(stores.map((s) => [s.id, s])), [stores])

  const performances = useMemo<PublicPerformance[]>(() => {
    const org = { id: organizationId ?? '', slug: organizationSlug, name: organizationName ?? '' }
    return allEvents
      .map((e) => buildPublicPerformance(e, e.scenario_data, e.store_id ? storesById.get(e.store_id) : null, org))
      .filter((p): p is PublicPerformance => p !== null)
  }, [allEvents, storesById, organizationId, organizationSlug, organizationName])

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

  /** 時間割に「貸切」と出す枠（貸切公演だけ。GM テスト・MTG などの社内予定は出さない） */
  const privateBlocks = useMemo<PrivateBlock[]>(() => blockedSlots
    .filter((e) => e.category === 'private' || e.is_private_booking === true)
    .map((e) => ({ store_id: e.store_id, date: e.date, start_time: e.start_time })), [blockedSlots])

  return { performances, storeOptions, nextDates, privateBlocks }
}

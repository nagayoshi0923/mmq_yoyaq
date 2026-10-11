/**
 * 元のカレンダー・リスト（#1046 より前の部品）を「空いている公演を探す」の下に出す包み。
 * 2026-10-12 社長決定: カレンダー・リストは元の実装を維持（構造・寸法は元のまま、見た目は新しいトップに合わせる）。
 * 操作は元のまま（年月・店舗・満席を非表示・ログイン中は体験済みを非表示）。人数などの新しい絞り込みは効かせない。
 */
import { useCallback } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { usePlayedScenarios } from '@/hooks/usePlayedScenarios'
import type { StoreOption } from '@/components/public-top/StorePicker'
import { storeDisplayName } from '@/lib/publicStoreName'
import { CalendarView } from '../CalendarView'
import { ListView } from '../ListView'
import { useCalendarData } from '../../hooks/useCalendarData'
import { useListViewData } from '../../hooks/useListViewData'
import type { EnrichedPublicEvent, PublicCalendarEvent, PublicEventRow, PublicStoreRow, ScenarioCard } from '../../hooks/useBookingData'

interface ClassicViewProps {
  allEvents: EnrichedPublicEvent[]
  blockedSlots: PublicEventRow[]
  stores: PublicStoreRow[]
  storeOptions: StoreOption[]
  scenarios: ScenarioCard[]
  organizationSlug: string
  organizationName: string | null
  privateBookingDeadlineDays: number
  selectedStoreIds: string[]
  onStoreIdsChange: (ids: string[]) => void
  hideSoldOut: boolean
  onHideSoldOutChange: (value: boolean) => void
  /** ログイン中だけ使う「体験済みを非表示」 */
  hidePlayed: boolean
  onHidePlayedChange: (value: boolean) => void
  primaryColor: string
  onCardClick: (scenarioId: string) => void
  /** リストで公演を押したとき（作品ページを公演選択済みで開く） */
  onEventClick: (scenarioId: string, eventId: string) => void
}

/** 過去の月へは戻さない（元の画面と同じ） */
function useFutureMonthSetter(set: (d: Date) => void) {
  return useCallback((next: Date) => {
    const today = new Date()
    const thisMonth = new Date(today.getFullYear(), today.getMonth(), 1)
    if (new Date(next.getFullYear(), next.getMonth(), 1) < thisMonth) return
    set(next)
  }, [set])
}

export function ClassicCalendar(props: ClassicViewProps) {
  const played = usePlayedFilter()
  const { hidePlayed, onHidePlayedChange, allEvents, blockedSlots, stores, storeOptions, scenarios, organizationSlug, organizationName, privateBookingDeadlineDays, selectedStoreIds, onStoreIdsChange, hideSoldOut, onHideSoldOutChange, primaryColor, onCardClick } = props
  const { currentMonth, setCurrentMonth, calendarDays, getEventsForDate } = useCalendarData(allEvents, selectedStoreIds, stores, `booking-${organizationSlug}-calendar-month`)
  const onMonthChange = useFutureMonthSetter(setCurrentMonth)
  const storesById = new Map(stores.map((s) => [s.id, s]))
  // 店舗名はお客様向けの名前（フォレスト①など）
  const getStoreName = (event: PublicCalendarEvent) => storeDisplayName(event.store_id ? storesById.get(event.store_id) : null, {
    organizationName, date: event.date, fallback: event.venue,
  })
  return (
    <CalendarView
      currentMonth={currentMonth}
      onMonthChange={onMonthChange}
      calendarDays={calendarDays}
      getEventsForDate={getEventsForDate}
      selectedStoreIds={selectedStoreIds}
      onStoreIdsChange={onStoreIdsChange}
      stores={stores}
      storeOptions={storeOptions}
      primaryColor={primaryColor}
      scenarios={scenarios}
      onCardClick={onCardClick}
      getStoreName={getStoreName}
      blockedSlots={blockedSlots}
      privateBookingDeadlineDays={privateBookingDeadlineDays}
      organizationSlug={organizationSlug}
      hideSoldOut={hideSoldOut}
      onHideSoldOutChange={onHideSoldOutChange}
      hidePlayed={played.isLoggedIn && hidePlayed}
      onHidePlayedChange={onHidePlayedChange}
      playedScenarioIds={played.playedScenarioIds}
      isLoggedIn={played.isLoggedIn}
    />
  )
}

export function ClassicList(props: ClassicViewProps) {
  const played = usePlayedFilter()
  const { hidePlayed, onHidePlayedChange, allEvents, blockedSlots, stores, storeOptions, scenarios, organizationSlug, organizationName, privateBookingDeadlineDays, selectedStoreIds, onStoreIdsChange, hideSoldOut, onHideSoldOutChange, primaryColor, onEventClick } = props
  const { listViewMonth, setListViewMonth, listViewData, getEventsForDateStore } = useListViewData(allEvents, stores, selectedStoreIds, blockedSlots, `booking-${organizationSlug}-list-month`)
  const onMonthChange = useFutureMonthSetter(setListViewMonth)
  return (
    <ListView
      listViewMonth={listViewMonth}
      onMonthChange={onMonthChange}
      selectedStoreIds={selectedStoreIds}
      onStoreIdsChange={onStoreIdsChange}
      stores={stores}
      storeOptions={storeOptions}
      organizationName={organizationName}
      primaryColor={primaryColor}
      listViewData={listViewData}
      getEventsForDateStore={getEventsForDateStore}
      scenarios={scenarios}
      onEventClick={onEventClick}
      blockedSlots={blockedSlots}
      privateBookingDeadlineDays={privateBookingDeadlineDays}
      organizationSlug={organizationSlug}
      hideSoldOut={hideSoldOut}
      onHideSoldOutChange={onHideSoldOutChange}
      hidePlayed={played.isLoggedIn && hidePlayed}
      onHidePlayedChange={onHidePlayedChange}
      playedScenarioIds={played.playedScenarioIds}
      isLoggedIn={played.isLoggedIn}
    />
  )
}

/** 「体験済みを非表示」に使う、ログイン中のお客様の体験済み作品 */
function usePlayedFilter() {
  const { user } = useAuth()
  const { playedScenarioIds } = usePlayedScenarios()
  return { isLoggedIn: !!user, playedScenarioIds }
}

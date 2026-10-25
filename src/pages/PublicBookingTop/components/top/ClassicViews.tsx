/**
 * 元のカレンダー・リスト（#1046 より前の部品）を「空いている公演を探す」の下に出す包み。
 * 2026-10-12 社長決定: カレンダー・リストは元の見た目を維持（店舗名・上の操作列・過去日・画像の比率だけ変更）。
 * 操作は元のまま（年月・店舗・満席を非表示・ログイン中は体験済みを非表示）。人数などの新しい絞り込みは効かせない。
 */
import { useCallback, useEffect } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { usePlayedScenarios } from '@/hooks/usePlayedScenarios'
import type { StoreOption } from '@/components/public-top/StorePicker'
import { storeShortDisplayName } from '@/lib/publicStoreName'
import { getColorFromName } from '@/lib/utils'
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
  organizationId: string | null
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
  /** 月送りで選べる最後の月（予約を受け付けている公開の公演がある最後の月） */
  lastMonth?: Date | null
  /** lastMonth が確定したか（false の間は、先にいても最後の月へ戻さない。再読み込み直後に前回の 2 月を 12 月へ戻さない） */
  limitReady?: boolean
  /** 表示中の月が変わったとき（その月の公演を読んでいなければ親が月ごとに読む） */
  onVisibleMonthChange?: (month: Date) => void
  /** その月の公演の状態（読み込み中・読めなかった・読めた）。読めていない月を「公演なし」と見せない */
  monthStatus?: (month: Date) => 'loading' | 'error' | 'ready'
  onRetryMonth?: (month: Date) => void
}

/**
 * 表示中の月を親に知らせ、その月の公演の状態を返す。
 * 選べる最後の月より先にいたら（組織を切り替えた・前回の月が残っていた）最後の月へ戻す。
 */
function useVisibleMonth(month: Date, props: Pick<ClassicViewProps, 'onVisibleMonthChange' | 'monthStatus' | 'lastMonth' | 'limitReady'>, setMonth: (d: Date) => void) {
  const { onVisibleMonthChange, monthStatus, lastMonth, limitReady = true } = props
  const key = `${month.getFullYear()}-${month.getMonth()}`
  const beyond = limitReady && !!lastMonth && (month.getFullYear() * 12 + month.getMonth()) > (lastMonth.getFullYear() * 12 + lastMonth.getMonth())
  useEffect(() => { if (beyond && lastMonth) setMonth(new Date(lastMonth.getFullYear(), lastMonth.getMonth(), 1)) // jst-ignore（カレンダーの月）
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [beyond, lastMonth])
  useEffect(() => { onVisibleMonthChange?.(new Date(month.getFullYear(), month.getMonth(), 1)) // jst-ignore（カレンダーの月）
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, onVisibleMonthChange])
  return monthStatus?.(month) ?? 'ready'
}

function MonthLoadingNote({ status, onRetry }: { status: 'loading' | 'error' | 'ready'; onRetry?: () => void }) {
  if (status === 'ready') return null
  if (status === 'error') {
    return (
      <p className="mb-2 text-sm text-destructive" role="alert" data-testid="classic-month-error">
        この月の公演を読み込めませんでした。{onRetry && <button type="button" className="underline" onClick={onRetry}>もう一度読み込む</button>}
      </p>
    )
  }
  return <p className="mb-2 text-sm text-muted-foreground" role="status" data-testid="classic-month-loading">この月の公演を読み込み中…</p>
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
  const { hidePlayed, onHidePlayedChange, allEvents, blockedSlots, stores, storeOptions, scenarios, organizationSlug, privateBookingDeadlineDays, selectedStoreIds, onStoreIdsChange, hideSoldOut, onHideSoldOutChange, primaryColor, onCardClick } = props
  const { currentMonth, setCurrentMonth, calendarDays, getEventsForDate } = useCalendarData(allEvents, selectedStoreIds, stores, `booking-${organizationSlug}-calendar-month`)
  const onMonthChange = useFutureMonthSetter(setCurrentMonth)
  const monthState = useVisibleMonth(currentMonth, props, setCurrentMonth)
  const storesById = new Map(stores.map((s) => [s.id, s]))
  // 店舗名はお客様向けの短い名前（フォレスト①・馬場(レ)など。無ければ元どおり略称）
  const getStoreName = (event: PublicCalendarEvent) => storeShortDisplayName(event.store_id ? storesById.get(event.store_id) : null, event.date, event.venue)
  // 店舗の色（元の見た目）
  const getStoreColor = (event: PublicCalendarEvent) => {
    const color = event.store_id ? storesById.get(event.store_id)?.color : null
    return color ? getColorFromName(color) : '#4F46E5'
  }
  return (
    <>
    <MonthLoadingNote status={monthState} onRetry={() => props.onRetryMonth?.(currentMonth)} />
    <CalendarView
      currentMonth={currentMonth}
      onMonthChange={onMonthChange}
      lastMonth={props.lastMonth}
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
      getStoreColor={getStoreColor}
      blockedSlots={blockedSlots}
      privateBookingDeadlineDays={privateBookingDeadlineDays}
      organizationId={props.organizationId}
      organizationSlug={organizationSlug}
      hideSoldOut={hideSoldOut}
      onHideSoldOutChange={onHideSoldOutChange}
      hidePlayed={played.isLoggedIn && hidePlayed}
      onHidePlayedChange={onHidePlayedChange}
      playedScenarioIds={played.playedScenarioIds}
      isLoggedIn={played.isLoggedIn}
    />
    </>
  )
}

export function ClassicList(props: ClassicViewProps) {
  const played = usePlayedFilter()
  const { hidePlayed, onHidePlayedChange, allEvents, blockedSlots, stores, storeOptions, scenarios, organizationSlug, privateBookingDeadlineDays, selectedStoreIds, onStoreIdsChange, hideSoldOut, onHideSoldOutChange, primaryColor, onCardClick } = props
  const { listViewMonth, setListViewMonth, listViewData, getEventsForDateStore } = useListViewData(allEvents, stores, selectedStoreIds, blockedSlots, `booking-${organizationSlug}-list-month`)
  const onMonthChange = useFutureMonthSetter(setListViewMonth)
  const monthState = useVisibleMonth(listViewMonth, props, setListViewMonth)
  return (
    <>
    <MonthLoadingNote status={monthState} onRetry={() => props.onRetryMonth?.(listViewMonth)} />
    <ListView
      listViewMonth={listViewMonth}
      onMonthChange={onMonthChange}
      lastMonth={props.lastMonth}
      selectedStoreIds={selectedStoreIds}
      onStoreIdsChange={onStoreIdsChange}
      stores={stores}
      storeOptions={storeOptions}
      primaryColor={primaryColor}
      listViewData={listViewData}
      getEventsForDateStore={getEventsForDateStore}
      getColorFromName={getColorFromName}
      scenarios={scenarios}
      onCardClick={onCardClick}
      blockedSlots={blockedSlots}
      privateBookingDeadlineDays={privateBookingDeadlineDays}
      organizationId={props.organizationId}
      organizationSlug={organizationSlug}
      hideSoldOut={hideSoldOut}
      onHideSoldOutChange={onHideSoldOutChange}
      hidePlayed={played.isLoggedIn && hidePlayed}
      onHidePlayedChange={onHidePlayedChange}
      playedScenarioIds={played.playedScenarioIds}
      isLoggedIn={played.isLoggedIn}
    />
    </>
  )
}

/** 「体験済みを非表示」に使う、ログイン中のお客様の体験済み作品 */
function usePlayedFilter() {
  const { user } = useAuth()
  const { playedScenarioIds } = usePlayedScenarios()
  return { isLoggedIn: !!user, playedScenarioIds }
}

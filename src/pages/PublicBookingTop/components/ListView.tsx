import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { memo, useMemo, useCallback } from 'react'
import React from 'react'
import { useNavigate } from 'react-router-dom'
import { BookingFilters } from './BookingFilters'
import { KeyVisualThumb } from '@/components/public-top/KeyVisualThumb'
import type { StoreOption } from '@/components/public-top/StorePicker'
import { storeDisplayName } from '@/lib/publicStoreName'
import { cn } from '@/lib/utils'
import { formatDateJST } from '@/utils/dateUtils'
import { scenarioCardId, scenarioCardTitle, type EnrichedPublicEvent, type PublicCalendarEvent, type PublicEventRow, type PublicStoreRow, type ScenarioCard } from '../hooks/useBookingData'

interface ListViewData {
  date: number
  store: PublicStoreRow
}

interface ListViewProps {
  listViewMonth: Date
  onMonthChange: (date: Date) => void
  selectedStoreIds: string[]
  onStoreIdsChange: (storeIds: string[]) => void
  stores: PublicStoreRow[]
  /** お客様向けの店舗名にした店舗の選択肢 */
  storeOptions: StoreOption[]
  /** 店舗名から外す組織名 */
  organizationName: string | null
  primaryColor: string
  listViewData: ListViewData[]
  getEventsForDateStore: (date: number, storeId: string) => EnrichedPublicEvent[]
  scenarios: ScenarioCard[]
  onCardClick: (scenarioId: string) => void
  blockedSlots?: PublicEventRow[]
  privateBookingDeadlineDays?: number
  organizationSlug?: string
  hideSoldOut?: boolean
  onHideSoldOutChange?: (value: boolean) => void
  hidePlayed?: boolean
  playedScenarioIds?: Set<string>
}

/**
 * リストビューコンポーネント
 */
export const ListView = memo(function ListView({
  listViewMonth,
  onMonthChange,
  selectedStoreIds,
  onStoreIdsChange,
  stores,
  storeOptions,
  organizationName,
  primaryColor,
  listViewData,
  getEventsForDateStore,
  scenarios,
  onCardClick,
  blockedSlots = [],
  privateBookingDeadlineDays = 14,
  organizationSlug,
  hideSoldOut = false,
  onHideSoldOutChange,
  hidePlayed = false,
  playedScenarioIds = new Set(),
}: ListViewProps) {
  const navigate = useNavigate()
  
  // 最適化: シナリオをMapでインデックス化（O(1)アクセス）
  const scenarioMap = useMemo(() => {
    const map = new Map<string, ScenarioCard>()
    scenarios.forEach(scenario => {
      map.set(scenario.scenario_id, scenario)
      if (scenario.scenario_title) {
        map.set(scenario.scenario_title, scenario)
      }
    })
    return map
  }, [scenarios])
  
  // GMテスト等のブロックイベントを日付×店舗×時間帯でインデックス化
  const blockedEventsByDateStoreSlot = useMemo(() => {
    const map = new Map<string, PublicEventRow[]>()
    blockedSlots.forEach(event => {
      const dateStr = event.date
      const eventStoreId = event.store_id || event.venue
      const hour = parseInt(event.start_time?.split(':')[0] || '0')
      let timeSlot = 'morning'
      if (hour >= 12 && hour <= 17) timeSlot = 'afternoon'
      else if (hour >= 18) timeSlot = 'evening'
      
      const key = `${dateStr}:${eventStoreId}:${timeSlot}`
      if (!map.has(key)) {
        map.set(key, [])
      }
      map.get(key)!.push(event)
    })
    return map
  }, [blockedSlots])

  // ブロックイベントを取得する関数
  const getBlockedEvents = useCallback((date: number, storeId: string, timeSlot: 'morning' | 'afternoon' | 'evening') => {
    const dateObj = new Date(listViewMonth.getFullYear(), listViewMonth.getMonth(), date)
    const dateStr = formatDateJST(dateObj)
    const key = `${dateStr}:${storeId}:${timeSlot}`
    return blockedEventsByDateStoreSlot.get(key) || []
  }, [blockedEventsByDateStoreSlot, listViewMonth])
  
  // 前公演のend_time + 1時間から開始時間を計算
  const defaultStartTimes: Record<string, string> = { morning: '09:00', afternoon: '14:00', evening: '19:00' }
  const slotEndTimes: Record<string, string> = { morning: '13:00', afternoon: '18:00', evening: '23:00' }
  
  const getSuggestedStartTime = (timeSlot: 'morning' | 'afternoon' | 'evening', precedingEvents: PublicEventRow[]) => {
    if (precedingEvents.length === 0) return defaultStartTimes[timeSlot]
    const latestEnd = precedingEvents.reduce((latest: string, e) => 
      (e.end_time || '') > latest ? (e.end_time || '') : latest, '')
    if (!latestEnd) return defaultStartTimes[timeSlot]
    // +1時間
    const [h, m] = latestEnd.split(':').map(Number)
    const suggested = `${String(h + 1).padStart(2, '0')}:${String(m || 0).padStart(2, '0')}`
    return suggested > defaultStartTimes[timeSlot] ? suggested : defaultStartTimes[timeSlot]
  }
  
  const isSlotAvailable = (timeSlot: 'morning' | 'afternoon' | 'evening', precedingEvents: PublicEventRow[]) => {
    const startTime = getSuggestedStartTime(timeSlot, precedingEvents)
    return startTime < slotEndTimes[timeSlot]
  }
  
  const renderEventCell = (events: EnrichedPublicEvent[], store: PublicStoreRow, timeSlot: 'morning' | 'afternoon' | 'evening', date: number, precedingEvents: PublicEventRow[] = []) => {
    // GMテスト等のブロックイベントを取得してマージ
    const blockedEvents = getBlockedEvents(date, store.id, timeSlot)
    const allMerged: PublicCalendarEvent[] = [...events, ...blockedEvents].sort((a, b) => {
      return (a.start_time || '').localeCompare(b.start_time || '')
    })
    const allEvents = allMerged.filter((ev) => {
      // 内部カテゴリは公開リストに表示しない（blockedSlotsで貸切申込ブロックは維持）
      const isHiddenCategory = ev.category === 'mtg'
        || ev.category === 'gmtest'
        || ev.category === 'testplay'
        || ev.category === 'venue_rental'
        || ev.category === 'venue_rental_free'
        || ev.category === 'package'
      if (isHiddenCategory) return false
      const isPrivate = ev.category === 'private' || ev.is_private_booking === true
      if (hideSoldOut && isPrivate) return false
      if (hidePlayed && isPrivate) {
        const smId = ev.scenario_master_id || ev.scenario_id
        if (smId && playedScenarioIds.has(smId)) return false
      }
      if (isPrivate) return true
      if (hideSoldOut) {
        const max = ev.player_count_max || 8
        const cur = ev.current_participants || 0
        if (max - cur === 0) return false
      }
      if (hidePlayed) {
        const smId = ev.scenario_master_id || ev.scenario_id
        if (smId && playedScenarioIds.has(smId)) return false
      }
      return true
    })
    
    // 日付文字列を生成（YYYY-MM-DD形式）
    const dateStr = `${listViewMonth.getFullYear()}-${String(listViewMonth.getMonth() + 1).padStart(2, '0')}-${String(date).padStart(2, '0')}`
    
    // 貸切申込の締切チェック
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const targetDate = new Date(listViewMonth.getFullYear(), listViewMonth.getMonth(), date)
    targetDate.setHours(0, 0, 0, 0)
    const diffDays = Math.ceil((targetDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
    const canApplyPrivateBooking = diffDays >= privateBookingDeadlineDays
    
    if (allEvents.length === 0) {
      // 締切を過ぎている場合は貸切ボタンを表示しない
      if (!canApplyPrivateBooking) {
        return <div className="p-1 sm:p-2 text-xs text-muted-foreground/60 text-center">–</div>
      }
      // GMテスト・MTG等が含まれるスロットは貸切申込を非表示（CalendarViewと同じ判定）
      const hasNonBookableEvent = allMerged.some((ev) =>
        ev.category === 'gmtest' || ev.category === 'testplay' || ev.category === 'mtg'
      )
      if (hasNonBookableEvent) {
        return <div className="p-1 sm:p-2 text-xs text-muted-foreground/60 text-center">–</div>
      }
      // 前公演の終了時間 + 1時間後が開始時間
      // 前のスロットのイベント + ブロックイベントを考慮
      const allPrecedingEvents = [...precedingEvents]
      // 前スロットのブロックイベントも含める
      const precedingSlotNames: Record<string, string[]> = {
        morning: [],
        afternoon: ['morning'],
        evening: ['morning', 'afternoon']
      }
      precedingSlotNames[timeSlot].forEach(pSlot => {
        const pBlocked = getBlockedEvents(date, store.id, pSlot as 'morning' | 'afternoon' | 'evening')
        allPrecedingEvents.push(...pBlocked)
      })
      
      // スロットが利用可能かチェック
      if (!isSlotAvailable(timeSlot, allPrecedingEvents)) {
        return <div className="p-1 sm:p-2 text-xs text-muted-foreground/60 text-center">–</div>
      }
      
      const suggestedTime = getSuggestedStartTime(timeSlot, allPrecedingEvents)
      return (
        <div className="p-1 sm:p-2">
          <button
            className="w-full rounded-md border border-dashed border-input bg-white py-1 sm:py-1.5 px-1 sm:px-2 text-xs text-muted-foreground transition-colors hover:bg-muted touch-manipulation"
            onClick={() => {
              const basePath = organizationSlug ? `/${organizationSlug}` : ''
              const storeParam = selectedStoreIds.length > 0 ? selectedStoreIds.join(',') : store.id
              navigate(`${basePath}/private-booking-select?date=${dateStr}&store=${storeParam}&slot=${timeSlot}&time=${suggestedTime}`)
            }}
          >
            {suggestedTime}〜 貸切申込
          </button>
        </div>
      )
    }

    return allEvents.map((event, idx: number) => {
      // useBookingDataで事前計算済みのplayer_count_maxを使用
      const maxParticipants = event.player_count_max || 8
      const currentParticipants = event.current_participants || 0
      const available = maxParticipants - currentParticipants
      const isFull = available === 0
      const isPrivateBooking = event.category === 'private' || event.is_private_booking === true
      const isReserved = isPrivateBooking
      
      // シナリオ情報を取得（クリック時のscenario_id用）
      const scenario = scenarioMap.get(event.scenario_id) || 
                       scenarioMap.get(event.scenario) ||
                       event.scenario_data
      // useBookingDataで事前計算済みのkey_visual_urlを使用
      const imageUrl = event.key_visual_url
      
      // 最小人数達成判定（開催決定）
      const minParticipants = scenario?.player_count_min || 1
      const isConfirmed = currentParticipants >= minParticipants && !isFull

      // 予約済みの場合はdisabledボタン風の表示
      if (isReserved) {
        return (
          <div key={idx} className="p-1 sm:p-2">
            <div
              className="flex w-full cursor-not-allowed items-center justify-between rounded-md bg-muted py-1 sm:py-1.5 px-1 sm:px-2 text-xs text-muted-foreground"
            >
              <span>{event.start_time?.slice(0, 5)}</span>
              <span>貸切</span>
            </div>
          </div>
        )
      }
      
      return (
        <div
          key={idx}
          className={cn('m-0.5 block cursor-pointer touch-manipulation rounded-md border border-border text-xs transition-colors hover:bg-muted/40', isFull ? 'bg-muted' : 'bg-white')}
          style={{ padding: '2px 3px' }}
          onClick={() => {
            if (scenario) {
              onCardClick(scenarioCardId(scenario))
            }
          }}
        >
          <div className="flex gap-0.5 sm:gap-2">
            {/* 左カラム: 画像（比率を保つ） */}
            <div className="flex-shrink-0 w-[28px] sm:w-[46px] self-stretch">
              <KeyVisualThumb
                src={imageUrl}
                alt={event.scenario || (scenario && scenarioCardTitle(scenario)) || 'シナリオ画像'}
                seed={event.scenario_master_id || event.id || String(idx)}
                width={100}
                className="h-full w-full rounded-sm"
              />
            </div>

            {/* 右カラム: 情報 */}
            <div className="flex flex-col gap-0 flex-1 min-w-0 justify-between">
              <div className="text-xs sm:text-sm text-left leading-tight text-muted-foreground">
                  {event.start_time?.slice(0, 5)}
                </div>
              <div className="text-xs sm:text-sm text-left truncate leading-tight font-bold text-foreground">
                {event.scenario}
              </div>
              <div className={`text-xs sm:text-sm text-right leading-tight flex items-center justify-end gap-1`}>
                {isConfirmed && (
                  <span className="ts-micro rounded-full bg-emerald-50 px-1 py-0.5 font-bold text-emerald-700">
                    開催決定
                  </span>
                )}
                <span className={isFull ? 'text-muted-foreground' : available <= 2 ? 'text-red-700' : 'text-emerald-700'}>
                  {isFull ? '満席' : `残${available}`}
                </span>
              </div>
            </div>
          </div>
        </div>
      )
    })
  }

  return (
    <div className="space-y-4">
      {/* 月ナビゲーション + 店舗フィルター（1行に配置） */}
      <BookingFilters
        currentMonth={listViewMonth}
        onMonthChange={onMonthChange}
        selectedStoreIds={selectedStoreIds}
        onStoreIdsChange={onStoreIdsChange}
        storeOptions={storeOptions}
        hideSoldOut={hideSoldOut}
        onHideSoldOutChange={onHideSoldOutChange}
        primaryColor={primaryColor}
      />

      {/* リスト表示テーブル */}
      <div className="overflow-x-auto overflow-hidden rounded-lg border border-border bg-white">
        <Table className="w-full table-fixed">
        <colgroup>
          <col className="hidden sm:table-column w-24" />
          <col className="w-12 sm:w-16" />
          <col className="w-auto" />
          <col className="w-auto" />
          <col className="w-auto" />
        </colgroup>
        <TableHeader>
          <TableRow className="bg-muted/50">
              <TableHead className="hidden sm:table-cell border-r text-sm whitespace-nowrap">日付</TableHead>
              <TableHead className="border-r text-xs sm:text-sm whitespace-nowrap">
                会場
              </TableHead>
              <TableHead className="border-r text-xs sm:text-sm text-center">
                <span className="sm:hidden">朝</span>
                <span className="hidden sm:inline">朝公演</span>
                <div className="ts-micro font-normal text-muted-foreground">9:00-12:00</div>
              </TableHead>
              <TableHead className="border-r text-xs sm:text-sm text-center">
                <span className="sm:hidden">昼</span>
                <span className="hidden sm:inline">昼公演</span>
                <div className="ts-micro font-normal text-muted-foreground">14:00-18:00</div>
              </TableHead>
              <TableHead className="text-xs sm:text-sm text-center">
                <span className="sm:hidden">夜</span>
                <span className="hidden sm:inline">夜公演</span>
                <div className="ts-micro font-normal text-muted-foreground">19:00-23:00</div>
              </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {listViewData.map(({ date, store }, index) => {
            const events = getEventsForDateStore(date, store.id)
            const dateObj = new Date(listViewMonth.getFullYear(), listViewMonth.getMonth(), date)
            const dayOfWeek = ['日', '月', '火', '水', '木', '金', '土'][dateObj.getDay()]

            // 時間帯別にイベントを分類
            // 公開公演の行に時間帯は無いため、開始時刻から判定する
            const morningEvents = events.filter(event => {
              // start_timeから判定
              const hour = parseInt(event.start_time?.split(':')[0] || '0')
              return hour >= 9 && hour < 12
            })
            const afternoonEvents = events.filter(event => {
              // start_timeから判定（17時を含む）
              const hour = parseInt(event.start_time?.split(':')[0] || '0')
              return hour >= 12 && hour <= 17
            })
            const eveningEvents = events.filter(event => {
              // start_timeから判定（18時以降が夜）
              const hour = parseInt(event.start_time?.split(':')[0] || '0')
              return hour >= 18
            })

            const isFirstRowOfDate = index === 0 || listViewData[index - 1]?.date !== date
            // 同じ日付の店舗数を計算（臨時会場のフィルタリングを考慮）
            const rowSpan = listViewData.filter(item => item.date === date).length

            return (
              <React.Fragment key={`${date}-${store.id}`}>
                {/* モバイル用：日付行（全幅） */}
                {isFirstRowOfDate && (
                  <TableRow className="sm:hidden bg-muted/40">
                    <TableCell colSpan={4} className={`text-left px-2 py-1.5 text-sm font-bold ${dayOfWeek === '日' ? 'text-red-600' : dayOfWeek === '土' ? 'text-blue-600' : ''}`}>
                      {listViewMonth.getMonth() + 1}/{date} ({dayOfWeek})
                  </TableCell>
                  </TableRow>
                )}

                <TableRow className={isFirstRowOfDate && index !== 0 ? 'border-t-2 border-gray-300' : ''}>
                  {/* 日付・曜日セル（統合）- デスクトップのみ表示 */}
                {isFirstRowOfDate && (
                    <TableCell className={`hidden sm:table-cell schedule-table-cell border-r text-sm align-top w-24 ${dayOfWeek === '日' ? 'text-red-600' : dayOfWeek === '土' ? 'text-blue-600' : ''}`} rowSpan={rowSpan}>
                      <div className="flex flex-col items-center">
                        <div className="">{listViewMonth.getMonth() + 1}/{date}</div>
                        <div className="text-sm">{dayOfWeek}</div>
                      </div>
                  </TableCell>
                )}

                {/* 店舗セル */}
                  <TableCell className="schedule-table-cell border-r venue-cell hover:bg-muted/30 transition-colors text-xs sm:text-sm w-10 sm:w-16">
                    <div className="break-all leading-tight font-bold text-foreground">
                    {storeDisplayName(store, { organizationName, date: `${listViewMonth.getFullYear()}-${String(listViewMonth.getMonth() + 1).padStart(2, '0')}-${String(date).padStart(2, '0')}` })}
                  </div>
                </TableCell>

                {/* 朝公演セル */}
                <TableCell className="schedule-table-cell p-0">
                  <div className="flex flex-col">
                    {renderEventCell(morningEvents, store, 'morning', date, [])}
                  </div>
                </TableCell>

                {/* 昼公演セル */}
                <TableCell className="schedule-table-cell p-0">
                  <div className="flex flex-col">
                    {renderEventCell(afternoonEvents, store, 'afternoon', date, morningEvents)}
                  </div>
                </TableCell>

                {/* 夜公演セル */}
                <TableCell className="schedule-table-cell p-0">
                  <div className="flex flex-col">
                    {renderEventCell(eveningEvents, store, 'evening', date, [...morningEvents, ...afternoonEvents])}
                  </div>
                </TableCell>
              </TableRow>
              </React.Fragment>
            )
          })}
        </TableBody>
      </Table>
      </div>
    </div>
  )
})


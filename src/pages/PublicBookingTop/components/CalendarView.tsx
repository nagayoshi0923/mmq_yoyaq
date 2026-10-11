import { memo, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { formatDateJST } from '@/utils/dateUtils'
import { BookingFilters } from './BookingFilters'
import { KeyVisualThumb } from '@/components/public-top/KeyVisualThumb'
import type { StoreOption } from '@/components/public-top/StorePicker'
import { cn } from '@/lib/utils'
import { scenarioCardId, scenarioCardTitle, type EnrichedPublicEvent, type PublicCalendarEvent, type PublicEventRow, type PublicStoreRow, type ScenarioCard } from '../hooks/useBookingData'

interface CalendarDay {
  date: Date
  isCurrentMonth: boolean
}

interface CalendarViewProps {
  currentMonth: Date
  onMonthChange: (date: Date) => void
  calendarDays: CalendarDay[]
  getEventsForDate: (date: Date) => EnrichedPublicEvent[]
  selectedStoreIds: string[]
  onStoreIdsChange: (storeIds: string[]) => void
  stores: PublicStoreRow[]
  /** お客様向けの店舗名にした店舗の選択肢 */
  storeOptions: StoreOption[]
  primaryColor: string
  scenarios: ScenarioCard[]
  onCardClick: (scenarioId: string) => void
  /** 公演を押したとき（作品ページをその公演を選んだ状態で開く。点検 24） */
  onEventClick?: (scenarioId: string, eventId: string) => void
  getStoreName: (event: PublicCalendarEvent) => string
  blockedSlots?: PublicEventRow[]
  privateBookingDeadlineDays?: number
  organizationSlug?: string
  hideSoldOut?: boolean
  onHideSoldOutChange?: (value: boolean) => void
  hidePlayed?: boolean
  onHidePlayedChange?: (value: boolean) => void
  playedScenarioIds?: Set<string>
  isLoggedIn?: boolean
}

/**
 * カレンダービューコンポーネント
 */
export const CalendarView = memo(function CalendarView({
  currentMonth,
  onMonthChange,
  calendarDays,
  getEventsForDate,
  selectedStoreIds,
  onStoreIdsChange,
  stores,
  storeOptions,
  primaryColor,
  scenarios,
  onCardClick,
  onEventClick,
  getStoreName,
  blockedSlots = [],
  privateBookingDeadlineDays = 14,
  organizationSlug,
  hideSoldOut = false,
  onHideSoldOutChange,
  hidePlayed = false,
  onHidePlayedChange,
  playedScenarioIds = new Set(),
  isLoggedIn = false,
}: CalendarViewProps) {
  const navigate = useNavigate()
  const todayStr = formatDateJST(new Date())
  
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
  
  // GMテスト等のブロックされたイベントを日付でMapに管理
  const blockedEventsByDate = useMemo(() => {
    const map = new Map<string, PublicEventRow[]>()
    blockedSlots.forEach(event => {
      if (!map.has(event.date)) {
        map.set(event.date, [])
      }
      map.get(event.date)!.push(event)
    })
    return map
  }, [blockedSlots])

  return (
    <div>
      {/* 月ナビゲーション + 店舗フィルター（1行に配置） */}
      <BookingFilters
        currentMonth={currentMonth}
        onMonthChange={onMonthChange}
        selectedStoreIds={selectedStoreIds}
        onStoreIdsChange={onStoreIdsChange}
        storeOptions={storeOptions}
        hideSoldOut={hideSoldOut}
        onHideSoldOutChange={onHideSoldOutChange}
        hidePlayed={hidePlayed}
        onHidePlayedChange={onHidePlayedChange}
        isLoggedIn={isLoggedIn}
        primaryColor={primaryColor}
      />
      
      {/* カレンダーグリッド */}
      <div className="overflow-hidden rounded-lg border border-border bg-white">
        {/* 曜日ヘッダー（日曜始まり） */}
        <div className="grid grid-cols-7 border-b bg-muted/30">
          {['日', '月', '火', '水', '木', '金', '土'].map((day, index) => (
            <div 
              key={day} 
              className={`text-center py-2 sm:py-3 text-xs sm:text-sm ${
                index === 0 ? 'text-red-600' : index === 6 ? 'text-blue-600' : ''
              }`}
            >
              {day}
            </div>
          ))}
        </div>
        
        {/* 日付グリッド */}
        <div className="grid grid-cols-7">
          {calendarDays.map((day, index) => {
            const events = getEventsForDate(day.date)
            const dateNum = day.date.getDate()
            const isWeekend = day.date.getDay() === 0 || day.date.getDay() === 6
            const isSunday = day.date.getDay() === 0
            // 今日より前の日は文言を出さず薄い地色だけ。過去だけの週は低くする（2026-10-12、スマホで画面の大半を占めていた）
            const isPast = formatDateJST(day.date) < todayStr
            
            return (
              <div
                key={index}
                className={`border-r border-b ${
                  isPast ? 'bg-muted/50' : !day.isCurrentMonth ? 'bg-muted/20' : ''
                } flex flex-col ${isPast ? 'min-h-[32px]' : 'min-h-[110px] sm:min-h-[150px]'}`}
              >
                {/* 日付 */}
                <div 
                  className={`text-xs p-0.5 sm:p-1 pb-0.5 flex-shrink-0 flex items-center justify-between ${
                    !day.isCurrentMonth 
                      ? 'text-muted-foreground' 
                      : isSunday 
                        ? 'text-red-600' 
                        : isWeekend 
                          ? 'text-blue-600' 
                          : ''
                  }`}
                >
                  <span>{dateNum}</span>
                  {events.length > 3 && (
                    <span 
                      className="cursor-help rounded-full bg-muted px-1 py-0.5 text-xs text-muted-foreground"
                      title={`他${events.length - 3}件の公演あり`}
                    >
                      +{events.length - 3}
                    </span>
                  )}
                </div>
                
                {/* 公演リスト（スクロール可能） */}
                <div className="relative space-y-1 px-0 pb-0 overflow-y-auto max-h-[200px] sm:max-h-[250px] scrollbar-thin scrollbar-thumb-gray-300 scrollbar-track-gray-100">
                  {(() => {
                    const dateStr = formatDateJST(day.date)
                    const allBlockedEvents = blockedEventsByDate.get(dateStr) || []
                    
                    // 貸切申込の締切チェック（締切日を過ぎていたら申込不可）
                    const today = new Date()
                    today.setHours(0, 0, 0, 0)
                    const targetDate = new Date(day.date)
                    targetDate.setHours(0, 0, 0, 0)
                    const diffDays = Math.ceil((targetDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
                    const canApplyPrivateBooking = diffDays >= privateBookingDeadlineDays
                    
                    // blockedEventsにも店舗フィルターを適用
                    const blockedEvents = selectedStoreIds.length > 0
                      ? allBlockedEvents.filter((e) => {
                          const eventStoreId = e.store_id || e.venue
                          return selectedStoreIds.some(storeId => {
                            const selectedStore = stores.find(s => s.id === storeId)
                            return eventStoreId === storeId || 
                                   eventStoreId === selectedStore?.short_name || 
                                   eventStoreId === selectedStore?.name
                          })
                        })
                      : allBlockedEvents
                    
                    // 通常公演 + 貸切公演 + GMテスト等を全てマージして時間順にソート
                    const allMergedEvents: PublicCalendarEvent[] = [...events, ...blockedEvents].sort((a, b) => {
                      return (a.start_time || '').localeCompare(b.start_time || '')
                    })
                    
                    const allDisplayEvents = allMergedEvents.filter((event) => {
                      // 内部カテゴリは公開カレンダーに表示しない（blockedSlotsで貸切申込ブロックは維持）
                      const isHiddenCategory = event.category === 'mtg'
                        || event.category === 'gmtest'
                        || event.category === 'testplay'
                        || event.category === 'venue_rental'
                        || event.category === 'venue_rental_free'
                        || event.category === 'package'
                      if (isHiddenCategory) return false
                      const isPrivate = event.category === 'private' || event.is_private_booking === true
                      if (hideSoldOut && isPrivate) return false
                      if (hidePlayed && isPrivate) {
                        const smId = event.scenario_master_id || event.scenario_id
                        if (smId && playedScenarioIds.has(smId)) return false
                      }
                      if (isPrivate) return true
                      if (hideSoldOut) {
                        const max = event.player_count_max || 8
                        const cur = event.current_participants || 0
                        if (max - cur === 0) return false
                      }
                      if (hidePlayed) {
                        const smId = event.scenario_master_id || event.scenario_id
                        if (smId && playedScenarioIds.has(smId)) return false
                      }
                      return true
                    })
                    
                    // 時間帯別にイベントを分類
                    const getTimeSlot = (startTime: string) => {
                      const hour = parseInt(startTime?.split(':')[0] || '0')
                      if (hour < 12) return 'morning'
                      if (hour < 18) return 'afternoon'
                      return 'evening'
                    }
                    
                    // 選択中の店舗（複数選択の場合は最初の店舗を使用）
                    const selectedStore = selectedStoreIds.length > 0 
                      ? stores.find(s => s.id === selectedStoreIds[0]) 
                      : null
                    
                    const timeSlots: { slot: 'morning' | 'afternoon' | 'evening', label: string, timeRange: string }[] = [
                      { slot: 'morning', label: '朝公演', timeRange: '9:00-12:00' },
                      { slot: 'afternoon', label: '昼公演', timeRange: '14:00-18:00' },
                      { slot: 'evening', label: '夜公演', timeRange: '19:00-23:00' }
                    ]
                    
                    // 時間帯ごとにイベントをグループ化
                    const eventsBySlot = {
                      morning: allDisplayEvents.filter((e) => getTimeSlot(e.start_time) === 'morning'),
                      afternoon: allDisplayEvents.filter((e) => getTimeSlot(e.start_time) === 'afternoon'),
                      evening: allDisplayEvents.filter((e) => getTimeSlot(e.start_time) === 'evening')
                    }
                    
                    // 前公演のend_time + 1時間を開始時間として計算
                    const defaultStartTimes: Record<string, string> = { morning: '09:00', afternoon: '14:00', evening: '19:00' }
                    const slotEndTimes: Record<string, string> = { morning: '13:00', afternoon: '18:00', evening: '23:00' }
                    const precedingSlotMap: Record<string, string[]> = {
                      morning: [],
                      afternoon: ['morning'],
                      evening: ['morning', 'afternoon']
                    }
                    const getSuggestedStartTime = (slot: 'morning' | 'afternoon' | 'evening') => {
                      const preceding = precedingSlotMap[slot]
                      if (preceding.length === 0) return defaultStartTimes[slot]
                      // 前のスロットにあるイベントの最遅end_timeを取得
                      const relevantEvents = allDisplayEvents.filter((e) => {
                        const eSlot = getTimeSlot(e.start_time)
                        return preceding.includes(eSlot)
                      })
                      if (relevantEvents.length === 0) return defaultStartTimes[slot]
                      const latestEnd = relevantEvents.reduce((latest: string, e) => 
                        (e.end_time || '') > latest ? (e.end_time || '') : latest, '')
                      if (!latestEnd) return defaultStartTimes[slot]
                      // +1時間
                      const [h, m] = latestEnd.split(':').map(Number)
                      const suggested = `${String(h + 1).padStart(2, '0')}:${String(m || 0).padStart(2, '0')}`
                      return suggested > defaultStartTimes[slot] ? suggested : defaultStartTimes[slot]
                    }
                    // スロットが利用可能かチェック（開始時間がスロット終了時間を超えたら非表示）
                    const isSlotAvailable = (slot: 'morning' | 'afternoon' | 'evening') => {
                      const startTime = getSuggestedStartTime(slot)
                      return startTime < slotEndTimes[slot]
                    }
                    
                    // 全店舗表示で何もない場合: 過去日は何も出さず、今日以降は小さく 1 行「貸切申込」（押すと貸切の流れへ）
                    if (allDisplayEvents.length === 0 && !selectedStore) {
                      if (isPast) return null
                      return (
                        <button
                          type="button"
                          className="ts-micro w-full whitespace-nowrap px-0.5 py-0.5 text-center text-muted-foreground hover:underline"
                          onClick={() => {
                            const basePath = organizationSlug ? `/${organizationSlug}` : ''
                            navigate(`${basePath}/private-booking-select?date=${dateStr}`)
                          }}
                        >
                          貸切申込
                        </button>
                      )
                    }
                    
                    // 時間帯順にイベントと貸切ボタンを表示
                    const renderEvent = (event: PublicCalendarEvent, idx: number) => {
                      // useBookingDataで事前計算済みのplayer_count_maxを使用
                      const maxParticipants = event.player_count_max || 8
                      const currentParticipants = event.current_participants || 0
                      const available = maxParticipants - currentParticipants
                      const isFull = available === 0
                      const isPrivateBooking = event.category === 'private' || event.is_private_booking === true
                      const isReserved = isPrivateBooking
                      const storeName = getStoreName(event)
                      
                      const scenario = scenarioMap.get(event.scenario_id) || 
                                     scenarioMap.get(event.scenario) ||
                                     event.scenario_data
                      const imageUrl = event.key_visual_url
                      
                      // 最小人数達成判定（開催決定）
                      const minParticipants = scenario?.player_count_min || 1
                      const isConfirmed = currentParticipants >= minParticipants && !isFull
                      const isNearlyFull = !isFull && available > 0 && available <= 3
                      
                      if (isReserved) {
                        return (
                          <div
                            key={`${event.id || idx}`}
                            className="ts-micro w-full cursor-not-allowed rounded-md bg-muted px-1 py-0.5 text-muted-foreground"
                          >
                            <span className="whitespace-nowrap">{event.start_time?.slice(0, 5)}</span>
                            {' '}
                            <span className="whitespace-nowrap">貸切</span>
                          </div>
                        )
                      }

                      const title = event.scenario
                      // 残席の言い方・色は新しいトップと同じ（残 3 以上は緑、残 2 以下は赤、満席は灰）
                      const capacityLabel = isFull ? '満席' : `残${available}`
                      const capacityClass = isFull ? 'text-muted-foreground' : available <= 2 ? 'text-red-700' : 'text-emerald-700'

                      return (
                        <div
                          key={`${event.id || idx}`}
                          onClick={() => {
                            if (!scenario) return
                            if (onEventClick && event.id) onEventClick(scenarioCardId(scenario), event.id)
                            else onCardClick(scenarioCardId(scenario))
                          }}
                          className={cn('ts-micro cursor-pointer touch-manipulation rounded-md border border-border transition-colors hover:bg-muted/40', isFull ? 'bg-muted' : 'bg-white')}
                          style={{ padding: '2px 3px' }}
                        >
                          <div className="flex gap-1 min-w-0">
                            {/* 左カラム: 画像（PC版のみ）。高さはテキスト2行に合わせる */}
                            <div className="hidden sm:block flex-shrink-0 w-7 self-stretch">
                              <KeyVisualThumb
                                src={imageUrl}
                                alt={title || (scenario && scenarioCardTitle(scenario)) || 'シナリオ画像'}
                                seed={event.scenario_master_id || event.id || String(idx)}
                                width={60}
                                className="h-full w-full rounded-sm"
                              />
                            </div>

                            {/* 右カラム: 1行目=時間・場所・人数 / 2行目=タイトル */}
                            <div className="flex flex-col min-w-0 flex-1">
                              <div className="flex items-baseline gap-1 min-w-0">
                                <span className="whitespace-nowrap flex-shrink-0 text-muted-foreground">
                                  {event.start_time?.slice(0, 5)}
                                </span>
                                <span className="truncate text-muted-foreground">
                                  {storeName}
                                </span>
                                {isConfirmed && (
                                  <span className="flex-shrink-0 whitespace-nowrap rounded-sm bg-emerald-50 px-0.5 font-bold text-emerald-700">
                                    決定
                                  </span>
                                )}
                                {isNearlyFull && (
                                  <span className="flex-shrink-0 whitespace-nowrap rounded-sm bg-red-50 px-0.5 font-bold text-red-700">
                                    残少
                                  </span>
                                )}
                                <span className={cn('ml-auto flex-shrink-0 whitespace-nowrap', capacityClass)}>
                                  {capacityLabel}
                                </span>
                              </div>
                              <div className="font-bold text-foreground overflow-hidden whitespace-nowrap" style={{ textOverflow: 'clip' }}>
                                {title}
                              </div>
                            </div>
                          </div>
                        </div>
                      )
                    }
                    
                    return (
                    <>
                      {/* 時間帯順にイベントと貸切ボタンを表示 */}
                      {timeSlots.map(({ slot }) => {
                        const slotEvents = eventsBySlot[slot]
                        const hasEvents = slotEvents.length > 0
                        
                        const renderedEvents = hasEvents
                          ? slotEvents.map((event, idx: number) => renderEvent(event, idx))
                          : []

                        // 非表示イベントも含めて占有・ブロック判定する（allMergedEventsを使用）
                        const allSlotEvents = allMergedEvents.filter((e) => getTimeSlot(e.start_time) === slot)
                        const occupiedStoreIds = new Set(allSlotEvents.map((e) => e.store_id))
                        const hasAvailableStores = selectedStoreIds.length > 0 &&
                          selectedStoreIds.some(id => !occupiedStoreIds.has(id))
                        // GMテスト・MTG等が含まれるスロットは貸切申込を非表示
                        const hasNonBookableEvent = allSlotEvents.some((e) =>
                          e.category === 'gmtest' || e.category === 'testplay' || e.category === 'mtg'
                        )
                        const showPrivateButton = selectedStore && canApplyPrivateBooking && isSlotAvailable(slot) && !hasNonBookableEvent

                        if (hasEvents && hasAvailableStores && showPrivateButton) {
                          const suggestedTime = getSuggestedStartTime(slot)
                          return (
                            <div key={slot}>
                              {renderedEvents}
                              <button
                                className="ts-micro w-full rounded-md border border-dashed border-input bg-white py-1 px-1 text-muted-foreground transition-colors hover:bg-muted touch-manipulation"
                                onClick={() => {
                                  const basePath = organizationSlug ? `/${organizationSlug}` : ''
                                  const storeParam = selectedStoreIds.join(',')
                                  navigate(`${basePath}/private-booking-select?date=${dateStr}&store=${storeParam}&slot=${slot}&time=${suggestedTime}`)
                                }}
                              >
                                <span className="whitespace-nowrap">{suggestedTime}〜</span> <span className="whitespace-nowrap">貸切申込</span>
                              </button>
                            </div>
                          )
                        } else if (hasEvents) {
                          return renderedEvents
                        } else if (showPrivateButton) {
                          const suggestedTime = getSuggestedStartTime(slot)
                          return (
                            <button
                              key={slot}
                              className="ts-micro w-full rounded-md border border-dashed border-input bg-white py-1 px-1 text-muted-foreground transition-colors hover:bg-muted touch-manipulation"
                              onClick={() => {
                                const basePath = organizationSlug ? `/${organizationSlug}` : ''
                                const storeParam = selectedStoreIds.length > 0 ? selectedStoreIds.join(',') : selectedStore.id
                                navigate(`${basePath}/private-booking-select?date=${dateStr}&store=${storeParam}&slot=${slot}&time=${suggestedTime}`)
                              }}
                            >
                              {suggestedTime}〜 貸切申込
                            </button>
                          )
                        }
                        return null
                      })}
                    </>
                    )
                  })()}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
})


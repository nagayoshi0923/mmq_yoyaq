import { usePublicPrivateBookingSlots } from '../hooks/usePublicPrivateBookingSlots'
import { memo, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { formatDateJST } from '@/utils/dateUtils'
import { BookingFilters } from './BookingFilters'
import { KeyVisualThumb } from '@/components/public-top/KeyVisualThumb'
import type { StoreOption } from '@/components/public-top/StorePicker'
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
  /** 上の操作列の店舗の選択肢（お客様向けの名前） */
  storeOptions: StoreOption[]
  primaryColor: string
  scenarios: ScenarioCard[]
  onCardClick: (scenarioId: string) => void
  getStoreName: (event: PublicCalendarEvent) => string
  getStoreColor: (event: PublicCalendarEvent) => string
  blockedSlots?: PublicEventRow[]
  privateBookingDeadlineDays?: number
  organizationId?: string | null
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
 * 2026-10-12 社長決定: 元の見た目を維持。変えたのは店舗名（お客様向け）・上の操作列のチップ・過去日の文言を出さない・作品画像の比率だけ。
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
  getStoreName,
  getStoreColor,
  blockedSlots = [],
  privateBookingDeadlineDays = 14,
  organizationId,
  organizationSlug,
  hideSoldOut = false,
  onHideSoldOutChange,
  hidePlayed = false,
  onHidePlayedChange,
  playedScenarioIds = new Set(),
  isLoggedIn = false,
}: CalendarViewProps) {
  const navigate = useNavigate()
  const getPrivateOptions = usePublicPrivateBookingSlots(organizationId, selectedStoreIds, currentMonth)
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
      <div className="bg-white border overflow-hidden">
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
            // 今日より前の日は文言を出さず薄い地色だけ。過去だけの週は低くする（#1057）
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
                      className="text-xs bg-blue-100 text-blue-600 px-0.5 sm:px-1 py-0.5 cursor-help"
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
                    
                    // 全店舗表示で何もない場合
                    if (allDisplayEvents.length === 0 && !selectedStore) {
                      if (isPast) return null
                      return (
                        <div className="p-1 sm:p-2 text-xs fg-gray-400 text-center">
                          店舗を選択して貸切申込
                        </div>
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
                      const storeColor = getStoreColor(event)
                      
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
                            className="w-full ts-10 leading-tight py-0.5 px-1 border border-gray-200 bg-gray-100 fg-gray-400 cursor-not-allowed"
                          >
                            <span className="whitespace-nowrap">{event.start_time?.slice(0, 5)}</span>
                            {' '}
                            <span className="whitespace-nowrap">貸切満席</span>
                          </div>
                        )
                      }

                      const metaColor = isFull ? '#6B7280' : storeColor
                      const title = event.scenario
                      const capacityLabel = isFull ? '満席' : `${currentParticipants}/${maxParticipants}`

                      return (
                        <div
                          key={`${event.id || idx}`}
                          onClick={() => scenario && onCardClick(scenarioCardId(scenario))}
                          className="ts-10 leading-tight transition-colors border-l-2 touch-manipulation cursor-pointer hover:bg-gray-50"
                          style={{
                            borderLeftColor: isFull ? '#9CA3AF' : storeColor,
                            backgroundColor: isFull ? '#F3F4F6' : `${storeColor}15`,
                            padding: '2px 3px'
                          }}
                        >
                          <div className="flex gap-1 min-w-0">
                            {/* 左カラム: 画像（PC版のみ）。高さはテキスト2行に合わせる */}
                            <div className="hidden sm:block flex-shrink-0 w-7 self-stretch overflow-hidden bg-gray-200">
                              <KeyVisualThumb
                                src={imageUrl}
                                alt={title || (scenario && scenarioCardTitle(scenario)) || 'シナリオ画像'}
                                seed={event.scenario_master_id || event.id || String(idx)}
                                width={60}
                                className="h-full w-full rounded-none bg-gray-200"
                              />
                            </div>

                            {/* 右カラム: 1行目=時間・場所・人数 / 2行目=タイトル */}
                            <div className="flex flex-col min-w-0 flex-1">
                              <div className="flex items-baseline gap-1 min-w-0">
                                <span className="whitespace-nowrap flex-shrink-0" style={{ color: metaColor }}>
                                  {event.start_time?.slice(0, 5)}
                                </span>
                                <span className="truncate" style={{ color: metaColor }}>
                                  {storeName}
                                </span>
                                {isConfirmed && (
                                  <span className="ts-8 font-bold px-0.5 bg-blue-100 text-blue-700 whitespace-nowrap flex-shrink-0">
                                    決定
                                  </span>
                                )}
                                {isNearlyFull && (
                                  <span className="ts-8 font-bold px-0.5 bg-orange-100 text-orange-600 whitespace-nowrap flex-shrink-0">
                                    残少
                                  </span>
                                )}
                                <span className={`ml-auto whitespace-nowrap flex-shrink-0 ${isFull ? 'fg-gray-500' : 'fg-gray-600'}`}>
                                  {capacityLabel}
                                </span>
                              </div>
                              <div className="fg-gray-800 overflow-hidden whitespace-nowrap" style={{ textOverflow: 'clip' }}>
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

                        // 営業設定・募集停止・非公開イベントも店舗ごとに判定
                        const options = getPrivateOptions(dateStr, slot)
                        const showPrivateButton = selectedStore && canApplyPrivateBooking && options.length > 0

                        if (hasEvents && showPrivateButton) {
                          const suggestedTime = options[0].startTime
                          return (
                            <div key={slot}>
                              {renderedEvents}
                              <button
                                className="w-full ts-10 leading-tight py-1 px-1 bg-gray-50 border border-gray-200 fg-gray-600 hover:bg-gray-100 hover:border-gray-300 transition-colors touch-manipulation"
                                onClick={() => {
                                  const basePath = organizationSlug ? `/${organizationSlug}` : ''
                                  const storeParam = options.map(option => option.storeId).join(',')
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
                          const suggestedTime = options[0].startTime
                          return (
                            <button
                              key={slot}
                              className="w-full ts-10 leading-tight py-1 px-1 bg-gray-50 border border-gray-200 fg-gray-600 hover:bg-gray-100 hover:border-gray-300 transition-colors touch-manipulation"
                              onClick={() => {
                                const basePath = organizationSlug ? `/${organizationSlug}` : ''
                                const storeParam = options.map(option => option.storeId).join(',')
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


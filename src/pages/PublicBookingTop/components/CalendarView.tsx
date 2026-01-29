import { memo, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { formatDateJST } from '@/utils/dateUtils'
import { BookingFilters } from './BookingFilters'
import { OptimizedImage } from '@/components/ui/optimized-image'

interface CalendarDay {
  date: Date
  isCurrentMonth: boolean
}

interface CalendarViewProps {
  currentMonth: Date
  onMonthChange: (date: Date) => void
  calendarDays: CalendarDay[]
  getEventsForDate: (date: Date) => any[]
  selectedStoreIds: string[]
  onStoreIdsChange: (storeIds: string[]) => void
  stores: any[]
  scenarios: any[]
  onCardClick: (scenarioId: string) => void
  getStoreName: (event: any) => string
  getStoreColor: (event: any) => string
  blockedSlots?: any[]
  privateBookingDeadlineDays?: number
  organizationSlug?: string
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
  scenarios,
  onCardClick,
  getStoreName,
  getStoreColor,
  blockedSlots = [],
  privateBookingDeadlineDays = 7,
  organizationSlug
}: CalendarViewProps) {
  const navigate = useNavigate()
  
  // 最適化: シナリオをMapでインデックス化（O(1)アクセス）
  const scenarioMap = useMemo(() => {
    const map = new Map<string, any>()
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
    const map = new Map<string, any[]>()
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
        stores={stores}
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
            
            return (
              <div
                key={index}
                className={`border-r border-b ${
                  !day.isCurrentMonth ? 'bg-muted/20' : ''
                } flex flex-col min-h-[110px] sm:min-h-[150px]`}
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
                      ? allBlockedEvents.filter((e: any) => {
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
                    const allDisplayEvents = [...events, ...blockedEvents].sort((a, b) => {
                      return (a.start_time || '').localeCompare(b.start_time || '')
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
                    
                    const timeSlots: { slot: 'morning' | 'afternoon' | 'evening', label: string }[] = [
                      { slot: 'morning', label: '朝公演' },
                      { slot: 'afternoon', label: '昼公演' },
                      { slot: 'evening', label: '夜公演' }
                    ]
                    
                    // 時間帯ごとにイベントをグループ化
                    const eventsBySlot = {
                      morning: allDisplayEvents.filter((e: any) => getTimeSlot(e.start_time) === 'morning'),
                      afternoon: allDisplayEvents.filter((e: any) => getTimeSlot(e.start_time) === 'afternoon'),
                      evening: allDisplayEvents.filter((e: any) => getTimeSlot(e.start_time) === 'evening')
                    }
                    
                    // 全店舗表示で何もない場合
                    if (allDisplayEvents.length === 0 && !selectedStore) {
                      return (
                        <div className="p-1 sm:p-2 text-xs text-gray-400 text-center">
                          店舗を選択して貸切申込
                        </div>
                      )
                    }
                    
                    // 時間帯順にイベントと貸切ボタンを表示
                    const renderEvent = (event: any, idx: number) => {
                      // useBookingDataで事前計算済みのplayer_count_maxを使用
                      const maxParticipants = event.player_count_max || 8
                      const available = maxParticipants - (event.current_participants || 0)
                      const isFull = available === 0
                      const isPrivateBooking = event.category === 'private' || event.is_private_booking === true
                      const isGmTest = event.category === 'gmtest' || event.category === 'testplay'
                      const isReserved = isPrivateBooking || isGmTest
                      const storeName = getStoreName(event)
                      const storeColor = getStoreColor(event)
                      
                      const scenario = scenarioMap.get(event.scenario_id) || 
                                     scenarioMap.get(event.scenario) ||
                                     event.scenario_data
                      const imageUrl = event.key_visual_url
                      
                      if (isReserved) {
                        return (
                          <div
                            key={`${event.id || idx}`}
                            className="w-full text-xs py-1 px-1 border border-gray-200 bg-gray-100 text-gray-400 cursor-not-allowed flex items-center justify-between"
                          >
                            <span>{event.start_time?.slice(0, 5)}</span>
                            <span>予約済</span>
                          </div>
                        )
                      }
                      
                      return (
                        <div
                          key={`${event.id || idx}`}
                          onClick={() => scenario && onCardClick(scenario.scenario_id)}
                          className="text-xs transition-colors border-l-2 touch-manipulation cursor-pointer hover:bg-gray-50"
                          style={{
                            borderLeftColor: isFull ? '#9CA3AF' : storeColor,
                            backgroundColor: isFull ? '#F3F4F6' : `${storeColor}15`,
                            padding: '2px 3px'
                          }}
                        >
                          <div className="flex gap-1 sm:gap-1.5">
                            {/* 左カラム: 画像（PC版のみ表示）比率1:1.4 */}
                            <div 
                              className="hidden sm:block flex-shrink-0 w-[40px] overflow-hidden bg-gray-200"
                              style={{ aspectRatio: '1 / 1.4' }}
                            >
                              {imageUrl ? (
                                <OptimizedImage
                                  src={imageUrl}
                                  alt={event.scenario || scenario?.scenario_title || event.scenarios?.title || 'シナリオ画像'}
                                  responsive={false}
                                  useWebP={true}
                                  quality={70}
                                  lazy={true}
                                  srcSetSizes={[50, 100]}
                                  breakpoints={{ mobile: 50, tablet: 75, desktop: 100 }}
                                  className="w-full h-full object-cover"
                                  fallback={
                                    <div className="w-full h-full bg-gray-200 flex items-center justify-center">
                                      <span className="text-gray-400 text-[8px]">No Image</span>
                                    </div>
                                  }
                                />
                              ) : (
                                <div className="w-full h-full bg-gray-200 flex items-center justify-center">
                                  <span className="text-gray-400 text-[8px]">No Image</span>
                                </div>
                              )}
                            </div>

                            {/* 右カラム: 情報 */}
                            <div className="flex flex-col gap-0 flex-1 min-w-0 justify-between">
                              <div className="text-xs leading-tight" style={{ color: isFull ? '#6B7280' : storeColor }}>
                                {event.start_time?.slice(0, 5)}
                              </div>
                              <div className="text-xs leading-tight" style={{ color: isFull ? '#6B7280' : storeColor }}>
                                {storeName}
                              </div>
                              <div 
                                className="text-xs leading-tight text-gray-800 overflow-hidden whitespace-nowrap"
                                style={{ textOverflow: 'clip' }}
                              >
                                {event.scenario || event.scenarios?.title}
                              </div>
                              <div className={`text-xs leading-tight ${isFull ? 'text-gray-500' : 'text-gray-600'}`}>
                                {isFull ? '満席' : `残${available}人`}
                              </div>
                            </div>
                          </div>
                        </div>
                      )
                    }
                    
                    return (
                    <>
                      {/* 時間帯順にイベントと貸切ボタンを表示 */}
                      {timeSlots.map(({ slot, label }) => {
                        const slotEvents = eventsBySlot[slot]
                        const hasEvents = slotEvents.length > 0
                        
                        if (hasEvents) {
                          // イベントがある場合
                          return slotEvents.map((event: any, idx: number) => renderEvent(event, idx))
                        } else if (selectedStore && canApplyPrivateBooking) {
                          // イベントがなく、店舗が選択されている、かつ締切前の場合は貸切ボタン
                          return (
                            <button
                              key={slot}
                              className="w-full text-xs py-1 px-1 border border-dashed border-gray-300 text-gray-500 hover:bg-gray-50 hover:border-gray-400 transition-colors touch-manipulation"
                              onClick={() => {
                                const basePath = organizationSlug ? `/${organizationSlug}` : ''
                                navigate(`${basePath}/private-booking-select?date=${dateStr}&store=${selectedStore.id}&slot=${slot}`)
                              }}
                            >
                              {label} 貸切申込
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


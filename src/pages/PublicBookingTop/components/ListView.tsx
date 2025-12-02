import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { memo, useMemo, useCallback } from 'react'
import React from 'react'
import { BookingFilters } from './BookingFilters'
import { OptimizedImage } from '@/components/ui/optimized-image'
import { formatDateJST } from '@/utils/dateUtils'

interface ListViewData {
  date: number
  store: any
}

interface ListViewProps {
  listViewMonth: Date
  onMonthChange: (date: Date) => void
  selectedStoreFilter: string
  onStoreFilterChange: (storeId: string) => void
  stores: any[]
  listViewData: ListViewData[]
  getEventsForDateStore: (date: number, storeId: string) => any[]
  getColorFromName: (color: string) => string
  scenarios: any[]
  onCardClick: (scenarioId: string) => void
  blockedSlots?: any[]
}

/**
 * リストビューコンポーネント
 */
export const ListView = memo(function ListView({
  listViewMonth,
  onMonthChange,
  selectedStoreFilter,
  onStoreFilterChange,
  stores,
  listViewData,
  getEventsForDateStore,
  getColorFromName,
  scenarios,
  onCardClick,
  blockedSlots = []
}: ListViewProps) {
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
  
  // GMテスト等のブロックイベントを日付×店舗×時間帯でインデックス化
  const blockedEventsByDateStoreSlot = useMemo(() => {
    const map = new Map<string, any[]>()
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
  
  const renderEventCell = (events: any[], store: any, timeSlot: 'morning' | 'afternoon' | 'evening', date: number) => {
    // GMテスト等のブロックイベントを取得してマージ
    const blockedEvents = getBlockedEvents(date, store.id, timeSlot)
    const allEvents = [...events, ...blockedEvents].sort((a, b) => {
      return (a.start_time || '').localeCompare(b.start_time || '')
    })
    
    if (allEvents.length === 0) {
      return (
        <div className="p-1 sm:p-2">
          <button
            className="w-full text-xs py-1 sm:py-1.5 px-1 sm:px-2 border border-dashed border-gray-300 rounded text-gray-600 hover:bg-gray-50 hover:border-gray-400 transition-colors touch-manipulation"
            onClick={() => {
              window.location.hash = `#private-booking-select?date=${timeSlot}&store=${store.id}&slot=${timeSlot}`
            }}
          >
            貸切申込
          </button>
        </div>
      )
    }

    return allEvents.map((event: any, idx: number) => {
      // useBookingDataで事前計算済みのplayer_count_maxを使用
      const maxParticipants = event.player_count_max || 8
      const currentParticipants = event.current_participants || 0
      const available = maxParticipants - currentParticipants
      const isFull = available === 0
      const isPrivateBooking = event.category === 'private' || event.is_private_booking === true
      const isGmTest = event.category === 'gmtest' || event.category === 'testplay'
      const isReserved = isPrivateBooking || isGmTest // 予約済みかどうか
      const storeColor = getColorFromName(store.color)
      
      // シナリオ情報を取得（クリック時のscenario_id用）
      const scenario = scenarioMap.get(event.scenario_id) || 
                       scenarioMap.get(event.scenario) ||
                       event.scenario_data
      // useBookingDataで事前計算済みのkey_visual_urlを使用
      const imageUrl = event.key_visual_url

      // 予約済みの場合はシンプル表示（画像なし）
      if (isReserved) {
        return (
          <div
            key={idx}
            className="text-xs border-l-2 bg-gray-100"
            style={{
              borderLeftColor: '#9CA3AF',
              padding: '2px 3px'
            }}
          >
            <div className="flex items-center gap-1 text-gray-500">
              <span>{event.start_time?.slice(0, 5)}</span>
              <span>予約済</span>
            </div>
          </div>
        )
      }
      
      return (
        <div
          key={idx}
          className="text-xs transition-colors border-l-2 touch-manipulation cursor-pointer hover:bg-gray-50"
          style={{
            borderLeftColor: isFull ? '#9CA3AF' : storeColor,
            backgroundColor: isFull ? '#F3F4F6' : `${storeColor}15`,
            padding: '2px 3px',
            display: 'block'
          }}
          onClick={() => {
            if (scenario) {
              onCardClick(scenario.scenario_id)
            }
          }}
        >
          <div className="flex gap-0.5 sm:gap-2">
            {/* 左カラム: 画像 */}
            <div className={`flex-shrink-0 w-[28px] sm:w-[46px] self-stretch overflow-hidden ${
              imageUrl ? 'bg-gray-200' : 'bg-gray-200'
            }`}>
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
                    <div className="w-full h-full bg-gray-200 relative">
                      <span className="absolute inset-0 flex items-center justify-center text-gray-400 text-[10px] sm:text-xs">
                        No Image
                      </span>
                    </div>
                  }
                />
              ) : (
                <div className="w-full h-full bg-gray-200 relative">
                  <span className="absolute inset-0 flex items-center justify-center text-gray-400 text-[10px] sm:text-xs">
                    No Image
                  </span>
                </div>
              )}
            </div>

            {/* 右カラム: 情報 */}
            <div className="flex flex-col gap-0 flex-1 min-w-0 justify-between">
              <div className="text-xs sm:text-sm text-left leading-tight" style={{ color: isFull ? '#6B7280' : storeColor }}>
                  {event.start_time?.slice(0, 5)}
                </div>
              <div className="text-xs sm:text-sm text-left truncate leading-tight text-gray-800">
                {event.scenario || event.scenarios?.title}
              </div>
              <div className={`text-xs sm:text-sm text-right leading-tight ${isFull ? 'text-gray-500' : 'text-gray-600'}`}>
                {isFull ? '満席' : `残り${available}人`}
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
        selectedStoreFilter={selectedStoreFilter}
        onStoreFilterChange={onStoreFilterChange}
        stores={stores}
      />

      {/* リスト表示テーブル */}
      <div className="overflow-x-auto -mx-2 sm:mx-0">
        <Table className="w-full">
        <TableHeader>
          <TableRow className="bg-muted/50">
              <TableHead className="hidden sm:table-cell w-20 sm:w-24 border-r text-sm whitespace-nowrap">日付</TableHead>
              <TableHead className="border-r text-xs sm:text-sm w-10 sm:w-16 whitespace-nowrap">
                会場
              </TableHead>
              <TableHead className="border-r text-xs sm:text-sm w-[28%]">
                <span className="sm:hidden">朝</span>
                <span className="hidden sm:inline">朝公演</span>
              </TableHead>
              <TableHead className="border-r text-xs sm:text-sm w-[28%]">
                <span className="sm:hidden">昼</span>
                <span className="hidden sm:inline">昼公演</span>
              </TableHead>
              <TableHead className="text-xs sm:text-sm w-[28%]">
                <span className="sm:hidden">夜</span>
                <span className="hidden sm:inline">夜公演</span>
              </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {listViewData.map(({ date, store }, index) => {
            const events = getEventsForDateStore(date, store.id)
            const dateObj = new Date(listViewMonth.getFullYear(), listViewMonth.getMonth(), date)
            const dayOfWeek = ['日', '月', '火', '水', '木', '金', '土'][dateObj.getDay()]

            // 時間帯別にイベントを分類
            // 全てのイベントでtimeSlot（朝/昼/夜）を使用、timeSlotがない場合はstart_timeから判定
            const morningEvents = events.filter(event => {
              // timeSlotが設定されている場合はそれを使用
              if (event.timeSlot) {
                return event.timeSlot === '朝'
              }
              // フォールバック：start_timeから判定
              const hour = parseInt(event.start_time?.split(':')[0] || '0')
              return hour >= 9 && hour < 12
            })
            const afternoonEvents = events.filter(event => {
              // timeSlotが設定されている場合はそれを使用
              if (event.timeSlot) {
                return event.timeSlot === '昼'
              }
              // フォールバック：start_timeから判定（17時を含む）
              const hour = parseInt(event.start_time?.split(':')[0] || '0')
              return hour >= 12 && hour <= 17
            })
            const eveningEvents = events.filter(event => {
              // timeSlotが設定されている場合はそれを使用
              if (event.timeSlot) {
                return event.timeSlot === '夜'
              }
              // フォールバック：start_timeから判定（18時以降が夜間）
              const hour = parseInt(event.start_time?.split(':')[0] || '0')
              return hour >= 18
            })

            const isFirstRowOfDate = index === 0 || listViewData[index - 1]?.date !== date
            const rowSpan = stores.filter(s => selectedStoreFilter === 'all' || s.id === selectedStoreFilter).length

            return (
              <React.Fragment key={`${date}-${store.id}`}>
                {/* モバイル用：日付行（全幅） */}
                {isFirstRowOfDate && (
                  <TableRow className="sm:hidden bg-muted/30">
                    <TableCell colSpan={4} className={`text-left px-2 py-1.5 text-xs ${dayOfWeek === '日' ? 'text-red-600' : dayOfWeek === '土' ? 'text-blue-600' : ''}`}>
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
                    <div className="whitespace-nowrap overflow-hidden text-ellipsis" style={{ color: getColorFromName(store.color) }}>
                    {store.short_name || store.name}
                  </div>
                </TableCell>

                {/* 朝公演セル */}
                <TableCell className="schedule-table-cell p-0">
                  <div className="flex flex-col">
                    {renderEventCell(morningEvents, store, 'morning', date)}
                  </div>
                </TableCell>

                {/* 昼公演セル */}
                <TableCell className="schedule-table-cell p-0">
                  <div className="flex flex-col">
                    {renderEventCell(afternoonEvents, store, 'afternoon', date)}
                  </div>
                </TableCell>

                {/* 夜公演セル */}
                <TableCell className="schedule-table-cell p-0">
                  <div className="flex flex-col">
                    {renderEventCell(eveningEvents, store, 'evening', date)}
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


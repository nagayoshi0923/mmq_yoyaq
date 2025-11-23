import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { memo, useState, useEffect, useMemo } from 'react'
import React from 'react'
import { BookingFilters } from './BookingFilters'
import { OptimizedImage } from '@/components/ui/optimized-image'

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
  onCardClick
}: ListViewProps) {
  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 640)
    }
    checkMobile()
    window.addEventListener('resize', checkMobile)
    return () => window.removeEventListener('resize', checkMobile)
  }, [])

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

  const renderEventCell = (events: any[], store: any, timeSlot: string) => {
    if (events.length === 0) {
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

    return events.map((event: any, idx: number) => {
      const maxParticipants = event.scenarios?.player_count_max || event.max_participants || 8
      const currentParticipants = event.current_participants || 0
      const available = maxParticipants - currentParticipants
      const isFull = available === 0
      const isPrivateBooking = event.category === 'private' || event.is_private_booking === true
      const storeColor = getColorFromName(store.color)
      
      // シナリオ情報を取得（最適化: Mapから直接取得）
      const scenario = scenarioMap.get(event.scenario_id) || 
                       scenarioMap.get(event.scenario) ||
                       scenarioMap.get(event.scenarios?.id) ||
                       scenarios.find((s: any) =>
                         s.scenario_id === event.scenario_id ||
                         s.scenario_title === event.scenario ||
                         s.scenario_id === event.scenarios?.id
                       )
      const imageUrl = scenario?.key_visual_url || event.scenarios?.image_url || event.scenarios?.key_visual_url

      return (
        <div
          key={idx}
          className={`text-xs transition-shadow border-l-2 touch-manipulation ${isPrivateBooking ? '' : 'cursor-pointer hover:shadow-md'}`}
          style={{
            borderLeftColor: isPrivateBooking ? '#9CA3AF' : (isFull ? '#9CA3AF' : storeColor),
            backgroundColor: isPrivateBooking ? '#F3F4F6' : (isFull ? '#F3F4F6' : `${storeColor}15`),
            padding: '2px 3px',
            display: 'block'
          }}
          onClick={() => {
            if (!isPrivateBooking && scenario) {
              onCardClick(scenario.scenario_id)
            }
          }}
        >
          <div className="flex gap-0.5 sm:gap-2">
            {/* 左カラム: 画像 */}
            <div className={`flex-shrink-0 w-[28px] h-[36px] sm:w-[46px] sm:h-[60px] overflow-hidden ${
              isPrivateBooking
                ? 'bg-gray-300'
                : imageUrl
                  ? 'bg-gray-200'
                  : 'bg-gray-200'
            }`}>
              {isPrivateBooking ? (
                <div className="w-full h-full bg-gray-300 flex items-center justify-center">
                  <span className="text-gray-500 text-xs">MMQ</span>
                </div>
              ) : imageUrl ? (
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
                    <div className="w-full h-full flex items-center justify-center text-gray-400 text-xs">
                      No Image
                    </div>
                  }
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-gray-400 text-xs">
                  No Image
                </div>
              )}
            </div>

            {/* 右カラム: 情報 */}
            <div className="flex flex-col gap-0 flex-1 min-w-0 justify-between">
              <div className="text-sm leading-tight text-left" style={{ color: isPrivateBooking ? '#6B7280' : (isFull ? '#6B7280' : storeColor) }}>
                  {event.start_time?.slice(0, 5)}
                </div>
              <div className={`text-sm font-medium leading-tight text-left truncate ${isPrivateBooking ? 'text-gray-500' : 'text-gray-800'}`}>
                {isPrivateBooking ? '貸切' : (event.scenario || event.scenarios?.title)}
              </div>
              <div className={`text-sm font-medium leading-tight text-right ${isPrivateBooking ? 'text-gray-500' : (isFull ? 'text-gray-500' : 'text-gray-600')}`}>
                {isPrivateBooking ? `残り0人` : isFull ? '満席' : `残り${available}人`}
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
        <Table className="sm:min-w-max" style={{ tableLayout: 'fixed', width: isMobile ? '100%' : 'auto' }}>
        <TableHeader>
          <TableRow className="bg-muted/50">
              <TableHead className="hidden sm:table-cell w-24 border-r text-sm">日付</TableHead>
              <TableHead className="border-r text-xs sm:text-sm" style={{ width: isMobile ? '10px' : '60px', minWidth: isMobile ? '10px' : '60px', maxWidth: isMobile ? '10px' : '60px', flexShrink: 0 }}>
                会場
              </TableHead>
              <TableHead className="w-10 sm:w-48 border-r text-xs sm:text-sm">
                <span className="sm:hidden">午前</span>
                <span className="hidden sm:inline">午前 (~12:00)</span>
              </TableHead>
              <TableHead className="w-10 sm:w-48 border-r text-xs sm:text-sm">
                <span className="sm:hidden">午後</span>
                <span className="hidden sm:inline">午後 (12:00-17:59)</span>
              </TableHead>
              <TableHead className="w-10 sm:w-48 text-xs sm:text-sm">
                <span className="sm:hidden">夜間</span>
                <span className="hidden sm:inline">夜間 (18:00~)</span>
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
                    <TableCell colSpan={4} className={`text-left px-2 py-1.5 text-xs font-medium ${dayOfWeek === '日' ? 'text-red-600' : dayOfWeek === '土' ? 'text-blue-600' : ''}`}>
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
                  <TableCell className="schedule-table-cell border-r venue-cell hover:bg-muted/30 transition-colors text-xs sm:text-sm" style={{ width: isMobile ? '10px' : '60px', minWidth: isMobile ? '10px' : '60px', maxWidth: isMobile ? '10px' : '60px', flexShrink: 0 }}>
                    <div className="leading-tight whitespace-nowrap overflow-hidden text-ellipsis" style={{ color: getColorFromName(store.color) }}>
                    {store.short_name || store.name}
                  </div>
                </TableCell>

                {/* 午前セル */}
                <TableCell className="schedule-table-cell p-0 w-10 sm:w-48">
                  <div className="flex flex-col">
                    {renderEventCell(morningEvents, store, 'morning')}
                  </div>
                </TableCell>

                {/* 午後セル */}
                <TableCell className="schedule-table-cell p-0 w-10 sm:w-48">
                  <div className="flex flex-col">
                    {renderEventCell(afternoonEvents, store, 'afternoon')}
                  </div>
                </TableCell>

                {/* 夜間セル */}
                <TableCell className="schedule-table-cell p-0 w-10 sm:w-48">
                  <div className="flex flex-col">
                    {renderEventCell(eveningEvents, store, 'evening')}
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


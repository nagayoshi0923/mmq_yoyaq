import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { memo } from 'react'
import { BookingFilters } from './BookingFilters'

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
  const renderEventCell = (events: any[], store: any, timeSlot: string) => {
    if (events.length === 0) {
      return (
        <div className="p-1 sm:p-2">
          <button
            className="w-full text-[9px] sm:text-xs py-1 sm:py-1.5 px-1 sm:px-2 border border-dashed border-gray-300 rounded text-gray-600 hover:bg-gray-50 hover:border-gray-400 transition-colors touch-manipulation"
            onClick={() => {
              window.location.hash = `#private-booking-select?date=${timeSlot}&store=${store.id}&slot=${timeSlot}`
            }}
          >
            貸切
          </button>
        </div>
      )
    }

    return events.map((event: any, idx: number) => {
      const available = (event.max_participants || 8) - (event.current_participants || 0)
      const isFull = available === 0
      const isPrivateBooking = event.category === 'private' || event.is_private_booking === true
      const storeColor = getColorFromName(store.color)

      return (
        <div
          key={idx}
          className={`text-[10px] sm:text-xs transition-shadow border-l-2 touch-manipulation ${isPrivateBooking ? '' : 'cursor-pointer hover:shadow-md'}`}
          style={{
            borderLeftColor: isPrivateBooking ? '#9CA3AF' : (isFull ? '#9CA3AF' : storeColor),
            backgroundColor: isPrivateBooking ? '#F3F4F6' : (isFull ? '#F3F4F6' : `${storeColor}15`),
            padding: '3px 4px',
            display: 'block'
          }}
          onClick={() => {
            if (!isPrivateBooking) {
              const scenario = scenarios.find((s: any) =>
                s.scenario_id === event.scenario_id ||
                s.scenario_title === event.scenario
              )
              if (scenario) onCardClick(scenario.scenario_id)
            }
          }}
        >
          <div className="flex gap-1 sm:gap-2">
            {/* 左カラム: 画像 */}
            <div className="flex-shrink-0 w-[18px] h-[24px] sm:w-[23px] sm:h-[30px] bg-gray-200 overflow-hidden">
              {event.scenarios?.image_url ? (
                <img
                  src={event.scenarios.image_url}
                  alt={event.scenario || event.scenarios?.title}
                  loading="lazy"
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-gray-400 text-[8px] sm:text-xs">
                  No Image
                </div>
              )}
            </div>

            {/* 右カラム: 情報 */}
            <div className="flex flex-col gap-0 flex-1 min-w-0">
              <div className="flex items-center gap-1 sm:gap-2">
                <div className="font-semibold text-[9px] sm:text-[10px] md:text-[11px] leading-tight" style={{ color: isPrivateBooking ? '#6B7280' : (isFull ? '#6B7280' : storeColor) }}>
                  {event.start_time?.slice(0, 5)}
                </div>
                <div className={`text-[9px] sm:text-[10px] md:text-[11px] font-medium leading-tight ${isPrivateBooking ? 'text-gray-500' : (isFull ? 'text-gray-500' : 'text-gray-600')}`}>
                  {isPrivateBooking ? '貸切' : isFull ? '満' : `${available}`}
                </div>
              </div>
              <div className={`text-[9px] sm:text-[10px] md:text-[11px] font-medium leading-tight text-left truncate ${isPrivateBooking ? 'text-gray-500' : 'text-gray-800'}`}>
                {isPrivateBooking ? '貸切' : (event.scenario || event.scenarios?.title)}
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
      <div className="overflow-x-auto -mx-4 sm:mx-0">
        <Table className="min-w-max">
          <TableHeader>
            <TableRow className="bg-muted/50">
              <TableHead className="w-16 sm:w-20 border-r text-xs sm:text-sm">日付</TableHead>
              <TableHead className="w-12 sm:w-16 border-r text-xs sm:text-sm">曜日</TableHead>
              <TableHead className="w-16 sm:w-20 border-r text-xs sm:text-sm">会場</TableHead>
              <TableHead className="w-32 sm:w-48 border-r text-xs sm:text-sm">午前 (~12:00)</TableHead>
              <TableHead className="w-32 sm:w-48 border-r text-xs sm:text-sm">午後 (12:00-17:59)</TableHead>
              <TableHead className="w-32 sm:w-48 text-xs sm:text-sm">夜間 (18:00~)</TableHead>
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
              <TableRow key={`${date}-${store.id}`} className={isFirstRowOfDate && index !== 0 ? 'border-t-2 border-gray-300' : ''}>
                {/* 日付セル */}
                {isFirstRowOfDate && (
                  <TableCell className="schedule-table-cell border-r text-xs sm:text-sm align-top" rowSpan={rowSpan}>
                    {listViewMonth.getMonth() + 1}/{date}
                  </TableCell>
                )}

                {/* 曜日セル */}
                {isFirstRowOfDate && (
                  <TableCell className={`schedule-table-cell border-r text-xs sm:text-sm align-top ${dayOfWeek === '日' ? 'text-red-600' : dayOfWeek === '土' ? 'text-blue-600' : ''}`} rowSpan={rowSpan}>
                    {dayOfWeek}
                  </TableCell>
                )}

                {/* 店舗セル */}
                <TableCell className="schedule-table-cell border-r venue-cell hover:bg-muted/30 transition-colors text-xs sm:text-sm">
                  <div className="font-medium" style={{ color: getColorFromName(store.color) }}>
                    {store.short_name || store.name}
                  </div>
                </TableCell>

                {/* 午前セル */}
                <TableCell className="schedule-table-cell p-0 w-32 sm:w-48">
                  <div className="flex flex-col">
                    {renderEventCell(morningEvents, store, 'morning')}
                  </div>
                </TableCell>

                {/* 午後セル */}
                <TableCell className="schedule-table-cell p-0 w-32 sm:w-48">
                  <div className="flex flex-col">
                    {renderEventCell(afternoonEvents, store, 'afternoon')}
                  </div>
                </TableCell>

                {/* 夜間セル */}
                <TableCell className="schedule-table-cell p-0 w-32 sm:w-48">
                  <div className="flex flex-col">
                    {renderEventCell(eveningEvents, store, 'evening')}
                  </div>
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
        </Table>
      </div>
    </div>
  )
})


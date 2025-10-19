import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { memo } from 'react'
import { MonthSwitcher } from '@/components/patterns/calendar'

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
        <div className="p-2">
          <button
            className="w-full text-xs py-1.5 px-2 border border-dashed border-gray-300 rounded text-gray-600 hover:bg-gray-50 hover:border-gray-400 transition-colors"
            onClick={() => {
              window.location.hash = `#private-booking-select?date=${timeSlot}&store=${store.id}&slot=${timeSlot}`
            }}
          >
            貸切申し込み
          </button>
        </div>
      )
    }

    return events.map((event: any, idx: number) => {
      const available = (event.max_participants || 8) - (event.current_participants || 0)
      const isFull = available === 0
      const storeColor = getColorFromName(store.color)

      return (
        <div
          key={idx}
          className="text-xs cursor-pointer hover:shadow-md transition-shadow border-l-2"
          style={{
            borderLeftColor: isFull ? '#9CA3AF' : storeColor,
            backgroundColor: isFull ? '#F3F4F6' : `${storeColor}15`,
            padding: '4px 6px',
            display: 'block'
          }}
          onClick={() => {
            const scenario = scenarios.find((s: any) =>
              s.scenario_id === event.scenario_id ||
              s.scenario_title === event.scenario
            )
            if (scenario) onCardClick(scenario.scenario_id)
          }}
        >
          <div className="flex gap-2">
            {/* 左カラム: 画像 */}
            <div className="flex-shrink-0 w-[23px] h-[30px] bg-gray-200 overflow-hidden">
              {event.scenarios?.image_url ? (
                <img
                  src={event.scenarios.image_url}
                  alt={event.scenario || event.scenarios?.title}
                  loading="lazy"
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-gray-400 text-xs">
                  No Image
                </div>
              )}
            </div>

            {/* 右カラム: 情報 */}
            <div className="flex flex-col gap-0 flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <div className="font-semibold text-[11px] leading-tight" style={{ color: isFull ? '#6B7280' : storeColor }}>
                  {event.start_time?.slice(0, 5)}
                </div>
                <div className={`text-[11px] font-medium leading-tight ${isFull ? 'text-gray-500' : 'text-gray-600'}`}>
                  {event.is_private_booking ? '貸切' : isFull ? '満席' : `残${available}席`}
                </div>
              </div>
              <div className="text-[11px] font-medium leading-tight text-left text-gray-800">
                {event.scenario || event.scenarios?.title}
              </div>
            </div>
          </div>
        </div>
      )
    })
  }

  return (
    <div className="space-y-4">
      {/* 月ナビゲーション */}
      <div className="flex items-center justify-between">
        <MonthSwitcher
          value={listViewMonth}
          onChange={onMonthChange}
          showToday
          quickJump
        />
      </div>

      {/* 店舗フィルター */}
      <div className="flex items-center gap-4">
        <label className="text-sm font-medium">店舗:</label>
        <Select value={selectedStoreFilter} onValueChange={onStoreFilterChange}>
          <SelectTrigger className="w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">すべて</SelectItem>
            {stores.map(store => (
              <SelectItem key={store.id} value={store.id}>
                {store.short_name || store.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* リスト表示テーブル */}
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/50">
            <TableHead className="w-20 border-r">日付</TableHead>
            <TableHead className="w-16 border-r">曜日</TableHead>
            <TableHead className="w-20 border-r">会場</TableHead>
            <TableHead style={{ width: '192px' }}>午前 (~12:00)</TableHead>
            <TableHead style={{ width: '192px' }}>午後 (12:00-17:00)</TableHead>
            <TableHead style={{ width: '192px' }}>夜間 (17:00~)</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {listViewData.map(({ date, store }, index) => {
            const events = getEventsForDateStore(date, store.id)
            const dateObj = new Date(listViewMonth.getFullYear(), listViewMonth.getMonth(), date)
            const dayOfWeek = ['日', '月', '火', '水', '木', '金', '土'][dateObj.getDay()]

            // 時間帯別にイベントを分類
            const morningEvents = events.filter(event => {
              const hour = parseInt(event.start_time?.split(':')[0] || '0')
              return hour >= 9 && hour < 12
            })
            const afternoonEvents = events.filter(event => {
              const hour = parseInt(event.start_time?.split(':')[0] || '0')
              return hour >= 12 && hour < 17
            })
            const eveningEvents = events.filter(event => {
              const hour = parseInt(event.start_time?.split(':')[0] || '0')
              return hour >= 17
            })

            const isFirstRowOfDate = index === 0 || listViewData[index - 1]?.date !== date
            const rowSpan = stores.filter(s => selectedStoreFilter === 'all' || s.id === selectedStoreFilter).length

            return (
              <TableRow key={`${date}-${store.id}`} className={isFirstRowOfDate && index !== 0 ? 'border-t-2 border-gray-300' : ''}>
                {/* 日付セル */}
                {isFirstRowOfDate && (
                  <TableCell className="schedule-table-cell border-r text-sm align-top" rowSpan={rowSpan}>
                    {listViewMonth.getMonth() + 1}/{date}
                  </TableCell>
                )}

                {/* 曜日セル */}
                {isFirstRowOfDate && (
                  <TableCell className={`schedule-table-cell border-r text-sm align-top ${dayOfWeek === '日' ? 'text-red-600' : dayOfWeek === '土' ? 'text-blue-600' : ''}`} rowSpan={rowSpan}>
                    {dayOfWeek}
                  </TableCell>
                )}

                {/* 店舗セル */}
                <TableCell className="schedule-table-cell border-r venue-cell hover:bg-muted/30 transition-colors text-sm">
                  <div className="font-medium" style={{ color: getColorFromName(store.color) }}>
                    {store.short_name || store.name}
                  </div>
                </TableCell>

                {/* 午前セル */}
                <TableCell className="schedule-table-cell p-0" style={{ width: '192px' }}>
                  <div className="flex flex-col">
                    {renderEventCell(morningEvents, store, 'morning')}
                  </div>
                </TableCell>

                {/* 午後セル */}
                <TableCell className="schedule-table-cell p-0" style={{ width: '192px' }}>
                  <div className="flex flex-col">
                    {renderEventCell(afternoonEvents, store, 'afternoon')}
                  </div>
                </TableCell>

                {/* 夜間セル */}
                <TableCell className="schedule-table-cell p-0" style={{ width: '192px' }}>
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
  )
})


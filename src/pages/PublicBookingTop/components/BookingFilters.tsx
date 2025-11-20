import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { MonthSwitcher } from '@/components/patterns/calendar'

interface BookingFiltersProps {
  currentMonth: Date
  onMonthChange: (date: Date) => void
  selectedStoreFilter: string
  onStoreFilterChange: (storeId: string) => void
  stores: any[]
}

/**
 * 予約サイト用のフィルターコンポーネント（月ナビゲーション + 店舗フィルター）
 * カレンダー表示とリスト表示で共通利用
 */
export function BookingFilters({
  currentMonth,
  onMonthChange,
  selectedStoreFilter,
  onStoreFilterChange,
  stores
}: BookingFiltersProps) {
  return (
    <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 sm:gap-4 mb-4 sm:mb-6">
      {/* 月ナビゲーション */}
      <div className="flex-1 sm:flex-initial">
        <MonthSwitcher
          value={currentMonth}
          onChange={onMonthChange}
          showToday
          quickJump
        />
      </div>
      
      {/* 店舗フィルター */}
      <div className="flex items-center gap-2 sm:gap-4">
        <label className="text-xs sm:text-sm font-medium whitespace-nowrap">店舗:</label>
        <Select value={selectedStoreFilter} onValueChange={onStoreFilterChange}>
          <SelectTrigger className="w-full sm:w-48 text-sm">
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
    </div>
  )
}


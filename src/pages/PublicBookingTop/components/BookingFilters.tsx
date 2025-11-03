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
    <div className="flex items-center justify-between gap-4 mb-6">
      {/* 月ナビゲーション */}
      <MonthSwitcher
        value={currentMonth}
        onChange={onMonthChange}
        showToday
        quickJump
      />
      
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
    </div>
  )
}


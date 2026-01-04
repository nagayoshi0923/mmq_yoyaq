import { MonthSwitcher } from '@/components/patterns/calendar'
import { StoreMultiSelect } from '@/components/ui/store-multi-select'

interface BookingFiltersProps {
  currentMonth: Date
  onMonthChange: (date: Date) => void
  selectedStoreIds: string[]
  onStoreIdsChange: (storeIds: string[]) => void
  stores: any[]
}

/**
 * 予約サイト用のフィルターコンポーネント（月ナビゲーション + 店舗フィルター）
 * カレンダー表示とリスト表示で共通利用
 */
export function BookingFilters({
  currentMonth,
  onMonthChange,
  selectedStoreIds,
  onStoreIdsChange,
  stores
}: BookingFiltersProps) {
  // 臨時会場を除外
  const filteredStores = stores.filter(store => !store.is_temporary)
  
  return (
    <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 mb-4 sm:mb-6">
      {/* 月ナビゲーション */}
      <div className="w-full sm:w-auto flex justify-center sm:justify-start">
        <MonthSwitcher
          value={currentMonth}
          onChange={onMonthChange}
          showToday
          quickJump
        />
      </div>
      
      {/* 店舗フィルター */}
      <div className="flex items-center gap-2 justify-center sm:justify-end">
        <label className="text-xs sm:text-sm whitespace-nowrap">店舗:</label>
        <div className="w-full sm:w-52">
          <StoreMultiSelect
            stores={filteredStores}
            selectedStoreIds={selectedStoreIds}
            onStoreIdsChange={onStoreIdsChange}
            hideLabel={true}
            placeholder="すべて"
            emptyText=""
          />
        </div>
      </div>
    </div>
  )
}


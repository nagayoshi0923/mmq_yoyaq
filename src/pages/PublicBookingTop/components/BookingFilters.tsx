import { MonthSwitcher } from '@/components/patterns/calendar'
import { StoreMultiSelect } from '@/components/ui/store-multi-select'
import { Button } from '@/components/ui/button'
import { EyeOff } from 'lucide-react'

interface BookingFiltersProps {
  currentMonth: Date
  onMonthChange: (date: Date) => void
  selectedStoreIds: string[]
  onStoreIdsChange: (storeIds: string[]) => void
  stores: any[]
  hideSoldOut?: boolean
  onHideSoldOutChange?: (value: boolean) => void
  hidePlayed?: boolean
  onHidePlayedChange?: (value: boolean) => void
  isLoggedIn?: boolean
}

/**
 * 予約サイト用のフィルターコンポーネント（月ナビゲーション + 店舗フィルター + 表示切替）
 * カレンダー表示とリスト表示で共通利用
 */
export function BookingFilters({
  currentMonth,
  onMonthChange,
  selectedStoreIds,
  onStoreIdsChange,
  stores,
  hideSoldOut = false,
  onHideSoldOutChange,
  hidePlayed = false,
  onHidePlayedChange,
  isLoggedIn = false,
}: BookingFiltersProps) {
  const filteredStores = stores.filter(store => !store.is_temporary)
  
  return (
    <div className="space-y-3 mb-4 sm:mb-6">
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
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
            />
          </div>
        </div>
      </div>

      {/* 表示切替ボタン */}
      <div className="flex items-center gap-2 justify-end flex-wrap">
        {onHideSoldOutChange && (
          <Button
            type="button"
            variant={hideSoldOut ? 'default' : 'outline'}
            size="sm"
            className={`h-7 text-xs gap-1 ${hideSoldOut ? 'bg-gray-700 hover:bg-gray-800' : ''}`}
            onClick={() => onHideSoldOutChange(!hideSoldOut)}
          >
            <EyeOff className="w-3 h-3" />
            満席を非表示
          </Button>
        )}
        {onHidePlayedChange && isLoggedIn && (
          <Button
            type="button"
            variant={hidePlayed ? 'default' : 'outline'}
            size="sm"
            className={`h-7 text-xs gap-1 ${hidePlayed ? 'bg-green-700 hover:bg-green-800' : ''}`}
            onClick={() => onHidePlayedChange(!hidePlayed)}
          >
            <EyeOff className="w-3 h-3" />
            体験済みを非表示
          </Button>
        )}
      </div>
    </div>
  )
}


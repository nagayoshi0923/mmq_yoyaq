import { memo, useState, useEffect } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { MultiSelect } from '@/components/ui/multi-select'
import type { TimeSlot } from '../utils/types'

interface Store {
  id: string
  name: string
  short_name: string
}

interface PrivateBookingFormProps {
  stores: Store[]
  selectedStoreIds: string[]
  onStoreIdsChange: (storeIds: string[]) => void
  currentMonth: Date
  onMonthChange: (delta: number) => void
  availableDates: string[]
  timeSlots: TimeSlot[]
  selectedSlots: Array<{ date: string; slot: TimeSlot }>
  onTimeSlotToggle: (date: string, slot: TimeSlot) => void
  checkTimeSlotAvailability: (date: string, slot: TimeSlot, storeIds?: string[]) => Promise<boolean>
}

/**
 * 貸切リクエストフォーム
 */
export const PrivateBookingForm = memo(function PrivateBookingForm({
  stores,
  selectedStoreIds,
  onStoreIdsChange,
  currentMonth,
  onMonthChange,
  availableDates,
  timeSlots,
  selectedSlots,
  onTimeSlotToggle,
  checkTimeSlotAvailability
}: PrivateBookingFormProps) {
  // 各時間枠の可用性を管理する状態
  const [availabilityMap, setAvailabilityMap] = useState<Record<string, boolean>>({})
  
  const isTimeSlotSelected = (date: string, slot: TimeSlot): boolean => {
    return selectedSlots.some(s => s.date === date && s.slot.label === slot.label)
  }
  
  // 各時間枠の可用性を非同期で取得
  useEffect(() => {
    const updateAvailability = async () => {
      const newAvailabilityMap: Record<string, boolean> = {}
      
      // 各日付・時間枠の可用性を並列で取得
      const promises = availableDates.flatMap(date =>
        timeSlots.map(async (slot) => {
          const key = `${date}-${slot.label}`
          const isAvailable = await checkTimeSlotAvailability(
            date,
            slot,
            selectedStoreIds.length > 0 ? selectedStoreIds : undefined
          )
          newAvailabilityMap[key] = isAvailable
        })
      )
      
      await Promise.all(promises)
      setAvailabilityMap(newAvailabilityMap)
    }
    
    updateAvailability()
  }, [availableDates, timeSlots, selectedStoreIds, checkTimeSlotAvailability])
  
  // 時間枠の可用性を取得
  const getAvailability = (date: string, slot: TimeSlot): boolean => {
    const key = `${date}-${slot.label}`
    // まだ取得されていない場合は、デフォルトでfalse（安全側に倒す）
    return availabilityMap[key] ?? false
  }


  return (
    <div>
      {/* 店舗選択 */}
      <div className="mb-4">
        <label className="text-sm font-medium text-muted-foreground mb-2 block">店舗を選択</label>
        <MultiSelect
          options={stores.map(store => ({
            id: store.id,
            name: store.name
          }))}
          selectedValues={selectedStoreIds.map(id => stores.find(s => s.id === id)?.name || '').filter(Boolean)}
          onSelectionChange={(storeNames) => {
            const storeIds = storeNames.map(name => 
              stores.find(s => s.name === name)?.id || ''
            ).filter(Boolean)
            onStoreIdsChange(storeIds)
          }}
          placeholder="店舗を選択（未選択=すべて）"
          showBadges={false}
        />
        {/* 選択された店舗を小さいバッジで表示 */}
        {selectedStoreIds.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-2">
            {selectedStoreIds.map(id => {
              const store = stores.find(s => s.id === id)
              return store ? (
                <span 
                  key={id} 
                  className="text-xs border border-gray-200 px-2 py-0.5 rounded bg-gray-50"
                >
                  {store.short_name || store.name}
                </span>
              ) : null
            })}
          </div>
        )}
      </div>
      
      {/* 月切り替え */}
      <div className="flex items-center justify-between mb-3">
        <button
          onClick={() => onMonthChange(-1)}
          disabled={currentMonth.getMonth() === new Date().getMonth() && currentMonth.getFullYear() === new Date().getFullYear()}
          className="text-sm text-muted-foreground hover:text-foreground disabled:opacity-40 disabled:cursor-not-allowed px-2 py-1"
        >
          ← 前月
        </button>
        <span className="text-sm font-medium">
          {currentMonth.getFullYear()}年{currentMonth.getMonth() + 1}月
        </span>
        <button
          onClick={() => onMonthChange(1)}
          className="text-sm text-muted-foreground hover:text-foreground px-2 py-1"
        >
          次月 →
        </button>
      </div>
      
      <div className="space-y-2 max-h-96 overflow-y-auto">
        {availableDates.map((date) => {
          const dateObj = new Date(date)
          const month = dateObj.getMonth() + 1
          const day = dateObj.getDate()
          const weekdays = ['日', '月', '火', '水', '木', '金', '土']
          const weekday = weekdays[dateObj.getDay()]
          
          // 曜日の色分け
          const dayOfWeek = dateObj.getDay()
          const weekdayColor = dayOfWeek === 0 ? 'text-red-600' : dayOfWeek === 6 ? 'text-blue-600' : ''
          
          return (
            <Card key={date}>
              <CardContent className="p-3">
                <div className="flex items-center gap-3">
                  {/* 日付 */}
                  <div className="flex-shrink-0 w-10 text-center">
                    <div className="text-sm font-medium">{month}/{day}</div>
                    <div className={`text-xs ${weekdayColor}`}>({weekday})</div>
                  </div>
                  
                  {/* 時間枠ボタン */}
                  <div className="flex gap-2 flex-1">
                    {timeSlots.map((slot) => {
                      const isAvailable = getAvailability(date, slot)
                      const isSelected = isTimeSlotSelected(date, slot)
                      
                      return (
                        <button
                          key={slot.label}
                          className={`flex-1 py-2 px-1 rounded border text-center transition-colors ${
                            !isAvailable 
                              ? 'border-gray-100 bg-gray-50 cursor-not-allowed opacity-50'
                              : isSelected
                              ? 'bg-purple-500 text-white border-purple-500'
                              : 'border-gray-200 hover:border-purple-300 hover:bg-purple-50'
                          }`}
                          disabled={!isAvailable}
                          onClick={() => isAvailable && onTimeSlotToggle(date, slot)}
                        >
                          <div className="text-xs font-medium">{slot.label}</div>
                          <div className="text-xs opacity-70">{slot.startTime}</div>
                        </button>
                      )
                    })}
                  </div>
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>
    </div>
  )
})


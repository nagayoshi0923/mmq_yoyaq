import { memo, useState, useEffect } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { MultiSelect } from '@/components/ui/multi-select'
import { CheckCircle2 } from 'lucide-react'
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
        <label className="text-base font-semibold mb-3 block">店舗を選択</label>
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
          <div className="flex flex-wrap gap-1 mt-2">
            {selectedStoreIds.map(id => {
              const store = stores.find(s => s.id === id)
              return store ? (
                <Badge 
                  key={id} 
                  variant="secondary" 
                  className="text-sm px-2 py-0.5"
                >
                  {store.short_name || store.name}
                </Badge>
              ) : null
            })}
          </div>
        )}
      </div>
      
      {/* 月切り替え */}
      <div className="flex items-center justify-between mb-4">
        <Button
          variant="outline"
          size="sm"
          onClick={() => onMonthChange(-1)}
          disabled={currentMonth.getMonth() === new Date().getMonth() && currentMonth.getFullYear() === new Date().getFullYear()}
          className="text-sm h-9"
        >
          &lt; 前月
        </Button>
        <h3 className="text-base">
          {currentMonth.getFullYear()}年{currentMonth.getMonth() + 1}月
        </h3>
        <Button
          variant="outline"
          size="sm"
          onClick={() => onMonthChange(1)}
          className="text-sm h-9"
        >
          次月 &gt;
        </Button>
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
                  <div className="text-sm whitespace-nowrap min-w-[50px] text-center">
                    <div>{month}/{day}</div>
                    <div className={`text-sm ${weekdayColor}`}>
                      ({weekday})
                    </div>
                  </div>
                  
                  {/* 時間枠ボタン */}
                  <div className="flex gap-1.5 flex-1">
                    {timeSlots.map((slot) => {
                      const isAvailable = getAvailability(date, slot)
                      const isSelected = isTimeSlotSelected(date, slot)
                      
                      return (
                        <Button
                          key={slot.label}
                          variant={isSelected ? "default" : "outline"}
                          size="sm"
                          className={`flex-1 py-2.5 min-h-[52px] text-sm px-1 ${
                            !isAvailable 
                              ? 'border-gray-200 bg-gray-50 cursor-not-allowed opacity-60'
                              : isSelected
                              ? 'bg-purple-500 text-white hover:bg-purple-600 border-purple-500'
                              : 'hover:bg-purple-50 hover:border-purple-200'
                          }`}
                          disabled={!isAvailable}
                          onClick={() => onTimeSlotToggle(date, slot)}
                        >
                          <div className="flex flex-col items-center justify-center min-h-[32px]">
                            <span className="whitespace-nowrap">{slot.label}</span>
                            {/* 時間帯の開始時間を表示 */}
                            <span className="text-xs mt-0.5 opacity-80">
                              {slot.startTime}
                            </span>
                            <div className="h-3 mt-0.5 flex items-center justify-center">
                              {isSelected && (
                                <CheckCircle2 className="w-3 h-3" />
                              )}
                            </div>
                          </div>
                        </Button>
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


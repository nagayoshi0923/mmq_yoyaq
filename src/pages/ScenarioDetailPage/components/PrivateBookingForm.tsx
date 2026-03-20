import { memo, useState, useEffect } from 'react'
import type { TimeSlot } from '../utils/types'
import { StoreSelector } from './StoreSelector'
import { isJapaneseHoliday } from '@/utils/japaneseHolidays'

interface Store {
  id: string
  name: string
  short_name: string
  region?: string
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
  maxSelections: number
  isCustomHoliday?: (date: string) => boolean
  blockedSlots?: string[]
}

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
  checkTimeSlotAvailability,
  maxSelections,
  isCustomHoliday,
  blockedSlots = []
}: PrivateBookingFormProps) {
  const remainingSelections = maxSelections - selectedSlots.length
  const [availabilityMap, setAvailabilityMap] = useState<Record<string, boolean>>({})
  
  const isTimeSlotSelected = (date: string, slot: TimeSlot): boolean => {
    return selectedSlots.some(s => s.date === date && s.slot.label === slot.label)
  }
  
  // 各時間枠の可用性を非同期で取得
  useEffect(() => {
    let isCancelled = false
    
    const updateAvailability = async () => {
      const newAvailabilityMap: Record<string, boolean> = {}
      
      const promises = availableDates.flatMap(date => {
        return timeSlots.map(async (slot) => {
          const key = `${date}-${slot.label}`
          const isAvailable = await checkTimeSlotAvailability(
            date,
            slot,
            selectedStoreIds.length > 0 ? selectedStoreIds : undefined
          )
          newAvailabilityMap[key] = isAvailable
        })
      })
      
      await Promise.all(promises)
      
      if (!isCancelled) {
        setAvailabilityMap(newAvailabilityMap)
      }
    }
    
    updateAvailability()
    
    return () => {
      isCancelled = true
    }
  }, [availableDates, timeSlots, selectedStoreIds, checkTimeSlotAvailability])
  
  const getAvailability = (date: string, slot: TimeSlot): boolean => {
    const key = `${date}-${slot.label}`
    return availabilityMap[key] ?? false
  }

  // 店舗が1つしかない場合は自動選択
  useEffect(() => {
    if (stores.length === 1 && selectedStoreIds.length === 0) {
      onStoreIdsChange([stores[0].id])
    }
  }, [stores, selectedStoreIds.length, onStoreIdsChange])

  return (
    <div>
      <StoreSelector
        stores={stores}
        selectedStoreIds={selectedStoreIds}
        onStoreIdsChange={onStoreIdsChange}
        label="希望店舗を選択"
        placeholder="店舗を選択してください"
      />
      
      <h3 className="text-sm font-medium text-muted-foreground mt-4 mb-1.5">希望日程を選択</h3>

      <div className="flex items-center justify-between mb-2">
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
      
      <div className="text-xs text-muted-foreground mb-2 text-center">
        {selectedSlots.length === 0 ? (
          <span>候補日時を選択してください（最大{maxSelections}件）</span>
        ) : remainingSelections > 0 ? (
          <span>
            <span className="font-medium text-red-600">{selectedSlots.length}件</span>選択中
            <span className="mx-1">･</span>
            あと<span className="font-medium">{remainingSelections}件</span>選択可能
          </span>
        ) : (
          <span className="text-orange-600 font-medium">選択上限に達しました（{maxSelections}件）</span>
        )}
      </div>
      
      <div className="max-h-[280px] overflow-y-auto border p-2">
        {availableDates.map((date) => {
          const dateObj = new Date(date + 'T00:00:00')
          const month = dateObj.getMonth() + 1
          const day = dateObj.getDate()
          const weekdays = ['日', '月', '火', '水', '木', '金', '土']
          const weekday = weekdays[dateObj.getDay()]
          
          const dayOfWeek = dateObj.getDay()
          const isHoliday = isJapaneseHoliday(date) || isCustomHoliday?.(date)
          const weekdayColor = isHoliday || dayOfWeek === 0 ? 'text-red-600' : dayOfWeek === 6 ? 'text-blue-600' : ''
          
          // 2週間以内の日付はdisable
          const today = new Date()
          today.setHours(0, 0, 0, 0)
          const twoWeeksLater = new Date(today)
          twoWeeksLater.setDate(today.getDate() + 14)
          const isTooSoon = dateObj < twoWeeksLater
          
          return (
            <div 
              key={date}
              className={`flex items-center gap-2 py-1.5 border-b border-gray-100 last:border-b-0 ${isTooSoon ? 'opacity-50' : ''}`}
            >
              <div className="flex-shrink-0 w-10 text-center">
                <div className="text-sm font-medium">{month}/{day}</div>
                <div className={`text-xs ${weekdayColor}`}>({weekday})</div>
              </div>
              
              <div className="flex gap-1.5 flex-1">
                {timeSlots.map((slot) => {
                  const isBlocked = blockedSlots.includes(slot.label)
                  // 2週間以内またはブロックされている場合は利用不可
                  const isTimeAvailable = !isTooSoon && !isBlocked && getAvailability(date, slot)
                  const isSelected = isTimeSlotSelected(date, slot)
                  
                  return (
                    <button
                      key={slot.label}
                      className={`flex-1 py-1 px-1 border text-center transition-colors ${
                        !isTimeAvailable 
                          ? 'border-gray-100 bg-gray-50 cursor-not-allowed opacity-50'
                          : isSelected
                          ? 'bg-[#E60012] text-white border-[#E60012]'
                          : 'border-gray-200 hover:border-red-300 hover:bg-red-50'
                      }`}
                      disabled={!isTimeAvailable}
                      onClick={() => isTimeAvailable && onTimeSlotToggle(date, slot)}
                    >
                      <div className="text-xs font-medium">{slot.label}</div>
                      <div className="text-[10px] opacity-70">{slot.startTime}〜{slot.endTime}</div>
                    </button>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
})

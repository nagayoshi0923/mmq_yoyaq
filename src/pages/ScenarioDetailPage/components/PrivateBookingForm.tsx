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
  timeSlots: TimeSlot[] // フォールバック用（デフォルト時間枠）
  selectedSlots: Array<{ date: string; slot: TimeSlot }>
  onTimeSlotToggle: (date: string, slot: TimeSlot) => void
  checkTimeSlotAvailability: (date: string, slot: TimeSlot, storeIds?: string[]) => Promise<boolean>
  maxSelections: number
  scenarioDuration: number // シナリオの所要時間（分）
  getTimeSlotsForDate?: (date: string) => TimeSlot[] // 日付ごとの時間枠取得（営業時間設定反映）
}

/**
 * 貸切リクエストフォーム
 */
// 開始時間から終了時間を計算する関数
const calculateEndTime = (startTime: string, durationMinutes: number): string => {
  const [hours, minutes] = startTime.split(':').map(Number)
  const totalMinutes = hours * 60 + minutes + durationMinutes
  const endHours = Math.floor(totalMinutes / 60) % 24
  const endMinutes = totalMinutes % 60
  return `${endHours.toString().padStart(2, '0')}:${endMinutes.toString().padStart(2, '0')}`
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
  scenarioDuration,
  getTimeSlotsForDate
}: PrivateBookingFormProps) {
  const remainingSelections = maxSelections - selectedSlots.length
  // 各時間枠の可用性を管理する状態
  const [availabilityMap, setAvailabilityMap] = useState<Record<string, boolean>>({})
  
  const isTimeSlotSelected = (date: string, slot: TimeSlot): boolean => {
    return selectedSlots.some(s => s.date === date && s.slot.label === slot.label)
  }
  
  // 各時間枠の可用性を非同期で取得
  useEffect(() => {
    const updateAvailability = async () => {
      const newAvailabilityMap: Record<string, boolean> = {}
      
      // 各日付・時間枠の可用性を並列で取得（常に3枠チェック）
      const promises = availableDates.flatMap(date => {
        // 日付ごとの開始時間を取得
        const slotsForDate = getTimeSlotsForDate ? getTimeSlotsForDate(date) : timeSlots
        const slotTimesMap = new Map(slotsForDate.map(s => [s.label, s.startTime]))
        
        return timeSlots.map(async (slot) => {
          // 日付ごとの開始時間を適用
          const startTime = slotTimesMap.get(slot.label) || slot.startTime
          const slotWithTime = { ...slot, startTime }
          const key = `${date}-${slot.label}`
          const isAvailable = await checkTimeSlotAvailability(
            date,
            slotWithTime,
            selectedStoreIds.length > 0 ? selectedStoreIds : undefined
          )
          newAvailabilityMap[key] = isAvailable
        })
      })
      
      await Promise.all(promises)
      setAvailabilityMap(newAvailabilityMap)
    }
    
    updateAvailability()
  }, [availableDates, timeSlots, selectedStoreIds, checkTimeSlotAvailability, getTimeSlotsForDate])
  
  // 時間枠の可用性を取得
  const getAvailability = (date: string, slot: TimeSlot): boolean => {
    const key = `${date}-${slot.label}`
    // まだ取得されていない場合は、デフォルトでfalse（安全側に倒す）
    return availabilityMap[key] ?? false
  }


  return (
    <div>
      {/* 店舗選択 */}
      <div className="mb-3">
        <label className="text-sm font-medium text-muted-foreground mb-1.5 block">店舗を選択</label>
        <MultiSelect
          options={stores.map(store => ({
            id: store.id,
            name: store.name
          }))}
          selectedValues={selectedStoreIds}
          onSelectionChange={onStoreIdsChange}
          placeholder="店舗を選択（未選択=すべて）"
          showBadges={false}
          useIdAsValue={true}
        />
        {/* 選択された店舗を小さいバッジで表示 */}
        {selectedStoreIds.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-2">
            {selectedStoreIds.map(id => {
              const store = stores.find(s => s.id === id)
              return store ? (
                <span 
                  key={id} 
                  className="text-xs border border-gray-200 px-2 py-0.5 rounded bg-gray-50 flex items-center gap-1"
                >
                  {store.short_name || store.name}
                  <button
                    type="button"
                    className="hover:bg-red-100 rounded-full p-0.5"
                    onClick={() => onStoreIdsChange(selectedStoreIds.filter(sid => sid !== id))}
                  >
                    <svg className="h-2.5 w-2.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M18 6L6 18M6 6l12 12" />
                    </svg>
                  </button>
                </span>
              ) : null
            })}
          </div>
        )}
      </div>
      
      {/* 月切り替え + 選択状況 */}
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
      
      {/* 選択状況 */}
      <div className="text-xs text-muted-foreground mb-2 text-center">
        {selectedSlots.length === 0 ? (
          <span>候補日時を選択してください（最大{maxSelections}件）</span>
        ) : remainingSelections > 0 ? (
          <span>
            <span className="font-medium text-purple-600">{selectedSlots.length}件</span>選択中
            <span className="mx-1">･</span>
            あと<span className="font-medium">{remainingSelections}件</span>選択可能
          </span>
        ) : (
          <span className="text-orange-600 font-medium">選択上限に達しました（{maxSelections}件）</span>
        )}
      </div>
      
      <div className="max-h-[280px] overflow-y-auto border rounded-lg p-2">
        {availableDates.map((date) => {
          const dateObj = new Date(date)
          const month = dateObj.getMonth() + 1
          const day = dateObj.getDate()
          const weekdays = ['日', '月', '火', '水', '木', '金', '土']
          const weekday = weekdays[dateObj.getDay()]
          
          // 曜日の色分け
          const dayOfWeek = dateObj.getDay()
          const weekdayColor = dayOfWeek === 0 ? 'text-red-600' : dayOfWeek === 6 ? 'text-blue-600' : ''
          
          // 日付ごとの時間枠を取得（営業時間設定反映）
          // 開始時間のみ取得（表示は常に3枠固定）
          const slotsForDate = getTimeSlotsForDate ? getTimeSlotsForDate(date) : timeSlots
          const slotTimesMap = new Map(slotsForDate.map(s => [s.label, s.startTime]))
          
          return (
            <div 
              key={date}
              className="flex items-center gap-2 py-1.5 border-b border-gray-100 last:border-b-0"
            >
              {/* 日付 */}
              <div className="flex-shrink-0 w-10 text-center">
                <div className="text-sm font-medium">{month}/{day}</div>
                <div className={`text-xs ${weekdayColor}`}>({weekday})</div>
              </div>
              
              {/* 時間枠ボタン（常に3枠表示、幅固定） */}
              <div className="flex gap-1.5 flex-1">
                {timeSlots.map((slot) => {
                  // 日付ごとの開始時間を取得（設定がなければデフォルト）
                  const startTime = slotTimesMap.get(slot.label) || slot.startTime
                  const slotWithTime = { ...slot, startTime }
                  const isAvailable = getAvailability(date, slotWithTime)
                  const isSelected = isTimeSlotSelected(date, slotWithTime)
                  const endTime = calculateEndTime(startTime, scenarioDuration)
                  
                  return (
                    <button
                      key={slot.label}
                      className={`flex-1 py-1 px-1 rounded border text-center transition-colors ${
                        !isAvailable 
                          ? 'border-gray-100 bg-gray-50 cursor-not-allowed opacity-50'
                          : isSelected
                          ? 'bg-purple-500 text-white border-purple-500'
                          : 'border-gray-200 hover:border-purple-300 hover:bg-purple-50'
                      }`}
                      disabled={!isAvailable}
                      onClick={() => isAvailable && onTimeSlotToggle(date, slotWithTime)}
                    >
                      <div className="text-xs font-medium">{slot.label}</div>
                      <div className="text-[10px] opacity-70">{startTime}〜{endTime}</div>
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


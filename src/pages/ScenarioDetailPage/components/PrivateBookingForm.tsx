import { memo, useState, useEffect, useMemo, useCallback, useRef } from 'react'
import type { TimeSlot } from '../utils/types'
import { StoreSelector } from './StoreSelector'
import { PrivateBookingSlotGrid } from '@/components/private-booking/PrivateBookingSlotGrid'
import type { PrivateBookingSlot } from '@/lib/computePrivateBookingSlots'

interface Store {
  id: string
  name: string
  short_name: string
  region?: string
}

const LABEL_TO_KEY: Record<string, PrivateBookingSlot['key']> = {
  '午前': 'morning',
  '午後': 'afternoon',
  '夜': 'evening',
}

function timeSlotToPrivateBookingSlot(slot: TimeSlot): PrivateBookingSlot {
  return {
    key: LABEL_TO_KEY[slot.label] || 'morning',
    label: slot.label as PrivateBookingSlot['label'],
    startTime: slot.startTime,
    endTime: slot.endTime,
  }
}

interface PrivateBookingFormProps {
  stores: Store[]
  selectedStoreIds: string[]
  onStoreIdsChange: (storeIds: string[]) => void
  currentMonth: Date
  onMonthChange: (delta: number) => void
  availableDates: string[]
  getTimeSlotsForDate: (date: string) => TimeSlot[]
  selectedSlots: Array<{ date: string; slot: TimeSlot }>
  onTimeSlotToggle: (date: string, slot: TimeSlot) => void
  checkTimeSlotAvailability: (date: string, slot: TimeSlot, storeIds?: string[]) => Promise<boolean>
  maxSelections: number
  isCustomHoliday?: (date: string) => boolean
  blockedSlots?: string[]
  isNextMonthDisabled?: boolean
  loading?: boolean
}

export const PrivateBookingForm = memo(function PrivateBookingForm({
  stores,
  selectedStoreIds,
  onStoreIdsChange,
  currentMonth,
  onMonthChange,
  availableDates,
  getTimeSlotsForDate,
  selectedSlots,
  onTimeSlotToggle,
  checkTimeSlotAvailability,
  maxSelections,
  isCustomHoliday,
  blockedSlots = [],
  isNextMonthDisabled = false,
  loading = false,
}: PrivateBookingFormProps) {
  const [availabilityMap, setAvailabilityMap] = useState<Record<string, boolean>>({})
  const [slotsByDate, setSlotsByDate] = useState<Record<string, PrivateBookingSlot[]>>({})
  const [isComputingSlots, setIsComputingSlots] = useState(false)

  // getTimeSlotsForDate を ref に保持（参照変更だけで再計算を走らせない）
  const getTimeSlotsRef = useRef(getTimeSlotsForDate)
  getTimeSlotsRef.current = getTimeSlotsForDate

  const checkAvailRef = useRef(checkTimeSlotAvailability)
  checkAvailRef.current = checkTimeSlotAvailability

  // availability チェック用の安定キー（参照比較ではなく内容比較）
  const storeIdsKey = selectedStoreIds.join(',')
  const datesKey = availableDates.join(',')

  // slotsByDate を遅延計算（レンダーを先に完了させてから計算を実行）
  useEffect(() => {
    if (availableDates.length === 0) {
      setSlotsByDate({})
      return
    }
    setIsComputingSlots(true)
    let isCancelled = false
    const timerId = setTimeout(() => {
      const map: Record<string, PrivateBookingSlot[]> = {}
      for (const date of availableDates) {
        map[date] = getTimeSlotsRef.current(date).map(timeSlotToPrivateBookingSlot)
      }
      if (!isCancelled) {
        setSlotsByDate(map)
        setIsComputingSlots(false)
      }
    }, 50)

    return () => {
      isCancelled = true
      clearTimeout(timerId)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [datesKey, storeIdsKey])

  // slotsByDate を ref に保持し、availability チェックの依存から外す
  const slotsByDateRef = useRef(slotsByDate)
  slotsByDateRef.current = slotsByDate

  // slotsByDate 安定キー
  const slotsByDateKey = useMemo(() => {
    return Object.entries(slotsByDate)
      .map(([d, slots]) => `${d}:${slots.map(s => s.key).join(',')}`)
      .join('|')
  }, [slotsByDate])

  // Async availability check with debounce（依存変更が連続しても 200ms の猶予を置く）
  useEffect(() => {
    const currentSlots = slotsByDateRef.current
    if (Object.keys(currentSlots).length === 0) return

    let isCancelled = false
    const timerId = setTimeout(() => {
      const newMap: Record<string, boolean> = {}

      const promises = availableDates.flatMap(date => {
        const daySlots = currentSlots[date] || []
        return daySlots.map(async (slot) => {
          const key = `${date}-${slot.label}`
          if (blockedSlots.includes(slot.label)) {
            newMap[key] = false
            return
          }
          const isAvailable = await checkAvailRef.current(
            date,
            { label: slot.label, startTime: slot.startTime, endTime: slot.endTime },
            selectedStoreIds.length > 0 ? selectedStoreIds : undefined
          )
          newMap[key] = isAvailable
        })
      })

      Promise.all(promises).then(() => {
        if (!isCancelled) {
          setAvailabilityMap(newMap)
        }
      })
    }, 200)

    return () => {
      isCancelled = true
      clearTimeout(timerId)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [datesKey, storeIdsKey, slotsByDateKey, blockedSlots])

  const gridSelectedSlots = useMemo(() =>
    selectedSlots.map(s => ({
      date: s.date,
      slot: timeSlotToPrivateBookingSlot(s.slot),
    })),
    [selectedSlots]
  )

  const handleSlotToggle = useCallback((date: string, slot: PrivateBookingSlot) => {
    onTimeSlotToggle(date, { label: slot.label, startTime: slot.startTime, endTime: slot.endTime })
  }, [onTimeSlotToggle])

  const isPrevMonthDisabled = currentMonth.getMonth() === new Date().getMonth()
    && currentMonth.getFullYear() === new Date().getFullYear()

  const isTooSoon = useCallback((date: string) => {
    const dateObj = new Date(date + 'T00:00:00+09:00')
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const twoWeeksLater = new Date(today)
    twoWeeksLater.setDate(today.getDate() + 14)
    return dateObj < twoWeeksLater
  }, [])

  // Auto-select when only one store
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

      <PrivateBookingSlotGrid
        currentMonth={currentMonth}
        onMonthChange={onMonthChange}
        isPrevMonthDisabled={isPrevMonthDisabled}
        isNextMonthDisabled={isNextMonthDisabled}
        availableDates={availableDates}
        slotsByDate={slotsByDate}
        selectedSlots={gridSelectedSlots}
        onSlotToggle={handleSlotToggle}
        maxSelections={maxSelections}
        availabilityMap={availabilityMap}
        isCustomHoliday={isCustomHoliday}
        colorScheme="purple"
        isTooSoon={isTooSoon}
        loading={loading || isComputingSlots}
      />
    </div>
  )
})

import { memo, useEffect, useMemo, useCallback } from 'react'
import type { TimeSlot } from '../utils/types'
import { StoreSelector } from './StoreSelector'
import { PrivateBookingSlotGrid } from '@/components/private-booking/PrivateBookingSlotGrid'
import type { PrivateBookingSlot } from '@/lib/computePrivateBookingSlots'
import type { CandidateSlotAvailability } from '@/lib/candidateSlotAvailability'

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
  /** DB の空き判定（private_booking_candidate_slot_availability）の結果。画面では計算しない */
  slotAvailability: CandidateSlotAvailability
  selectedSlots: Array<{ date: string; slot: TimeSlot }>
  onTimeSlotToggle: (date: string, slot: TimeSlot) => void
  maxSelections: number
  isCustomHoliday?: (date: string) => boolean
  isNextMonthDisabled?: boolean
  loading?: boolean
  /** 予約受付締切（公演日の何日前まで申込可能か）。設定 > 予約設定の値 */
  deadlineDays?: number
}

export const PrivateBookingForm = memo(function PrivateBookingForm({
  stores,
  selectedStoreIds,
  onStoreIdsChange,
  currentMonth,
  onMonthChange,
  availableDates,
  slotAvailability,
  selectedSlots,
  onTimeSlotToggle,
  maxSelections,
  isCustomHoliday,
  isNextMonthDisabled = false,
  loading = false,
  deadlineDays = 14,
}: PrivateBookingFormProps) {
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
    const deadline = new Date(today)
    deadline.setDate(today.getDate() + deadlineDays)
    return dateObj < deadline
  }, [deadlineDays])

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

      <h3 className="ts-label mt-4">希望日程を選択</h3>
      {deadlineDays > 0 && (
        <p className="text-xs text-muted-foreground mb-1">
          貸切リクエストは公演日の{deadlineDays}日前まで受け付けています（薄く表示された日・灰色の枠は選べません。灰色の枠を押すと理由を表示します）
        </p>
      )}

      <PrivateBookingSlotGrid
        currentMonth={currentMonth}
        onMonthChange={onMonthChange}
        isPrevMonthDisabled={isPrevMonthDisabled}
        isNextMonthDisabled={isNextMonthDisabled}
        availableDates={availableDates}
        slotsByDate={slotAvailability.slotsByDate}
        selectedSlots={gridSelectedSlots}
        onSlotToggle={handleSlotToggle}
        maxSelections={maxSelections}
        unavailableReasons={slotAvailability.unavailableReasons}
        isCustomHoliday={isCustomHoliday}
        colorScheme="purple"
        isTooSoon={isTooSoon}
        loading={loading}
      />
    </div>
  )
})

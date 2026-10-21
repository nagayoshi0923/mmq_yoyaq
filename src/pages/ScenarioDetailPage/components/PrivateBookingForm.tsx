// 貸切の候補日時の選択（空き判定は DB の private_booking_candidate_slot_availability 系）。
// 仕様の正本: docs/product-spec/貸切受付ルール.md。変更時は同じ PR で更新。
import { memo, useEffect, useMemo, useCallback } from 'react'
import type { TimeSlot } from '../utils/types'
import { StoreSelector } from './StoreSelector'
import { PrivateBookingSlotGrid } from '@/components/private-booking/PrivateBookingSlotGrid'
import type { PrivateBookingSlot } from '@/lib/computePrivateBookingSlots'
import type { CandidateSlotAvailability } from '@/lib/candidateSlotAvailability'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { AlertTriangle, RefreshCw } from 'lucide-react'
import { PrivateBookingHorizonNotice } from '@/components/private-booking/PrivateBookingHorizonNotice'
import type { PrivateBookingHorizonState } from '@/lib/privateBookingHorizon'

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
  /** 空き状況を読めなかったときの文面（通信失敗など）。「空きなし」と区別して赤い案内と再読み込みを出す */
  availabilityError?: string | null
  onRetryAvailability?: () => void
  /** 受付範囲。days が null（読み込み中・読めなかった）の間は日付・枠を出さず、確認中・再試行を出す（Codex 点検 不具合 5） */
  horizon?: PrivateBookingHorizonState
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
  availabilityError = null,
  onRetryAvailability,
  horizon,
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

      {horizon && horizon.days === null ? (
        <PrivateBookingHorizonNotice horizon={horizon} className="mt-2" />
      ) : availabilityError ? (
        // 読めなかったときは日付・枠を出さない（空きが無いように見えるため）。予約確認の取消規定（#1084）と同じ形
        <Card className="border-2 border-red-300 bg-red-50" data-testid="private-booking-availability-error">
          <CardContent className="p-3 space-y-2">
            <div className="flex items-start gap-2 text-red-800" role="alert">
              <AlertTriangle className="w-5 h-5 flex-shrink-0 mt-0.5" aria-hidden="true" />
              <p className="text-sm font-bold">空き状況を読み込めませんでした。通信を確認して再読み込みしてください</p>
            </div>
            {onRetryAvailability && (
              <Button
                type="button"
                variant="outline"
                className="w-full min-h-11"
                onClick={onRetryAvailability}
                disabled={loading}
                data-testid="private-booking-availability-retry"
              >
                <RefreshCw className={`w-4 h-4 mr-2${loading ? ' animate-spin' : ''}`} aria-hidden="true" />
                {loading ? '読み込み中…' : '空き状況を再読み込み'}
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
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
      )}
    </div>
  )
})

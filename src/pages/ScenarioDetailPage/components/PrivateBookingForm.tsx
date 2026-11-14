// 貸切の候補日時の選択（空き判定は DB の private_booking_candidate_slot_availability 系）。
// 仕様の正本: docs/product-spec/貸切受付ルール.md。変更時は同じ PR で更新。
import { memo, useEffect, useMemo, useCallback, useState, type ReactNode } from 'react'
import type { TimeSlot } from '../utils/types'
import { StoreSelector } from './StoreSelector'
import { PrivateBookingSlotGrid } from '@/components/private-booking/PrivateBookingSlotGrid'
import type { PrivateBookingSlot } from '@/lib/computePrivateBookingSlots'
import { availableSlotsForDate, type CandidateSlotAvailability } from '@/lib/candidateSlotAvailability'
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
  /** 枠表の上に出す「近い空き・月ごとの空き数・絞り込み」（段階1、2026-11-14） */
  overview?: ReactNode
  /** 絞り込み（土日祝だけ など）に合う日か。合わない日は枠表に出さない */
  dateFilter?: (date: string) => boolean
  /** 時間帯の絞り込み。'all' 以外なら、その時間帯に空きのある日だけを「空きのある日」とみなす */
  slotFilter?: 'all' | PrivateBookingSlot['label']
  /** 選べない枠を押したときの代わりの候補（PrivateBookingSlotGrid の describeAlternatives） */
  describeAlternatives?: (date: string, label: PrivateBookingSlot['label']) => string | null
  /** この月に空きが無いとき「次に空きがある月（例 12月）へ」を出す */
  nextOpenMonth?: { label: string; onClick: () => void } | null
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
  overview,
  dateFilter,
  describeAlternatives,
  nextOpenMonth = null,
  slotFilter = 'all',
}: PrivateBookingFormProps) {
  // 空きのある日だけを並べる（2026-11-14 段階1。締切済みの日は 1 行にたたむ）。押すと空きのない日も出す
  const [showOnlyOpen, setShowOnlyOpen] = useState(true)
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

  // 締切済みの日は枠表に並べず「M/D までは受付を終了しています」の 1 行にたたむ
  const hasOpenSlot = useCallback((date: string) => availableSlotsForDate(slotAvailability, date)
    .some(slot => slotFilter === 'all' || slot.label === slotFilter), [slotAvailability, slotFilter])
  const tooSoonDates = useMemo(() => availableDates.filter(isTooSoon), [availableDates, isTooSoon])
  const lastTooSoon = tooSoonDates.length > 0 ? tooSoonDates[tooSoonDates.length - 1] : null
  const visibleDates = useMemo(() => availableDates.filter(date => {
    if (isTooSoon(date)) return false
    if (dateFilter && !dateFilter(date)) return false
    if (showOnlyOpen && !hasOpenSlot(date)) return false
    return true
  }), [availableDates, isTooSoon, dateFilter, showOnlyOpen, hasOpenSlot])
  // 空きが無いので省いた日（絞り込みで外した日は数えない）
  const hiddenCount = useMemo(() => availableDates.filter(date =>
    !isTooSoon(date) && (!dateFilter || dateFilter(date)) && !hasOpenSlot(date),
  ).length, [availableDates, isTooSoon, dateFilter, hasOpenSlot])

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
        selectedDisplay="badges"
      />

      <h3 className="ts-label mt-4">希望日程を選択</h3>
      <p className="ts-caption mb-2">
        空いている枠を押すと候補に入ります（最大{maxSelections}件）。{deadlineDays > 0 ? `貸切は公演日の${deadlineDays}日前まで申し込めます。` : ''}
      </p>
      {overview && !(horizon && horizon.days === null) && !availabilityError && <div className="mb-3">{overview}</div>}

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
        availableDates={visibleDates}
        slotsByDate={slotAvailability.slotsByDate}
        selectedSlots={gridSelectedSlots}
        onSlotToggle={handleSlotToggle}
        maxSelections={maxSelections}
        unavailableReasons={slotAvailability.unavailableReasons}
        isCustomHoliday={isCustomHoliday}
        colorScheme="purple"
        conflictAsFull
        isTooSoon={isTooSoon}
        loading={loading}
        describeAlternatives={describeAlternatives}
        bodyNotice={(lastTooSoon || hiddenCount > 0 || !showOnlyOpen) && (
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2 ts-caption" data-testid="private-booking-collapsed">
            <span>
              {lastTooSoon && `${Number(lastTooSoon.slice(5, 7))}/${Number(lastTooSoon.slice(8, 10))} までは受付を終了しています。`}
              {showOnlyOpen && hiddenCount > 0 && `${slotFilter === 'all' ? '空きのない日' : `${slotFilter}に空きのない日`}（${hiddenCount}日）は省いています。`}
            </span>
            {(hiddenCount > 0 || !showOnlyOpen) && (
              <button type="button" className="text-purple-700 underline" onClick={() => setShowOnlyOpen(v => !v)} data-testid="private-booking-toggle-open-only">
                {showOnlyOpen ? '空きのない日も表示' : '空きのある日だけ表示'}
              </button>
            )}
          </div>
        )}
        emptyMonth={
          <div className="space-y-2 px-2 py-6 text-center ts-caption" data-testid="private-booking-empty-month">
            <p>この月は申し込める空きがありません。</p>
            {nextOpenMonth && (
              <Button type="button" variant="outline" className="border-purple-300 text-purple-700" onClick={nextOpenMonth.onClick}>
                次に空きがある {nextOpenMonth.label} を見る
              </Button>
            )}
          </div>
        }
      />
      )}
    </div>
  )
})

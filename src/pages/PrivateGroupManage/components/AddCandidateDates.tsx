// 貸切の候補日時の選択（空き判定は DB の private_booking_candidate_slot_availability 系）。
// 仕様の正本: docs/product-spec/貸切受付ルール.md。変更時は同じ PR で更新。
import { useState, useCallback, useMemo, useEffect, useRef, type ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { Plus, Loader2, Calendar } from 'lucide-react'
import { logger } from '@/utils/logger'
import { useCustomHolidays } from '@/hooks/useCustomHolidays'
import type { PrivateGroupCandidateDate } from '@/types'
import { privateGroupTimeSlotFromDb } from '@/lib/privateGroupTimeSlot'
import { addPrivateGroupCandidates } from '@/lib/privateGroupCandidateDates'
import type { PrivateBookingSlot } from '@/lib/computePrivateBookingSlots'
import { useCandidateSlotAvailability } from '@/hooks/useCandidateSlotAvailability'
import { useScenarioStoreHint } from '@/hooks/useScenarioStoreHint'
import { ScenarioStoreHint } from '@/components/private-booking/ScenarioStoreHint'
import { usePrivateBookingDeadlineState, DEFAULT_PRIVATE_BOOKING_DEADLINE_DAYS } from '@/hooks/usePrivateBookingDeadlineDays'
import { PrivateBookingSlotGrid } from '@/components/private-booking/PrivateBookingSlotGrid'
import { showToast } from '@/utils/toast'
import { getJstParts } from '@/utils/jstDate'

function getJstDateStringFromNow(now = new Date()): string {
  const jstOffsetMin = 9 * 60
  const jst = new Date(now.getTime() + (jstOffsetMin + now.getTimezoneOffset()) * 60 * 1000)
  return `${jst.getFullYear()}-${String(jst.getMonth() + 1).padStart(2, '0')}-${String(jst.getDate()).padStart(2, '0')}`
}

function addCalendarDaysYmd(ymd: string, days: number): string {
  const [y, m, d] = ymd.split('-').map(Number)
  const dt = new Date(y, m - 1, d + days)
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`
}

function getFirstSelectableMonthStart(minAdvanceDays: number, now = new Date()): Date {
  const minStr = addCalendarDaysYmd(getJstDateStringFromNow(now), minAdvanceDays)
  const [y, m] = minStr.split('-').map(Number)
  return new Date(y, m - 1, 1)
}

interface AddCandidateDatesProps {
  groupId: string
  organizationId: string
  scenarioId: string
  storeIds: string[]
  existingDates: PrivateGroupCandidateDate[]
  onDatesAdded: () => void
  /**
   * dialog: ダイアログの中で使う。月の切り替えと件数を上に、選択中と保存ボタンを下に貼り付ける（スクロールはダイアログ全体の 1 つ）。
   * embedded（既定）: ページに埋め込む。貼り付けず、カレンダーは全部出し、保存ボタンはカレンダーの直下。
   */
  layout?: 'dialog' | 'embedded'
  /** dialog のとき「キャンセル」で呼ぶ（ダイアログを閉じる）。未指定なら編集欄をたたむ */
  onCancel?: () => void
  /** dialog のとき、カレンダーの下（同じスクロールの末尾）に出すもの。登録済みの候補日など */
  belowCalendar?: ReactNode
}

export function AddCandidateDates({
  groupId,
  organizationId,
  scenarioId,
  storeIds,
  existingDates,
  onDatesAdded,
  layout = 'embedded',
  onCancel,
  belowCalendar,
}: AddCandidateDatesProps) {
  const isDialog = layout === 'dialog'
  // ダイアログでは開いた直後からカレンダーを出す
  const [isOpen, setIsOpen] = useState(isDialog)
  const cancel = () => {
    if (onCancel) onCancel()
    else setIsOpen(false)
  }
  const [currentMonth, setCurrentMonth] = useState(() =>
    getFirstSelectableMonthStart(DEFAULT_PRIVATE_BOOKING_DEADLINE_DAYS)
  )
  const wasOpenRef = useRef(false)
  const emptyMonthAutoSkipRef = useRef(0)
  const [selectedSlots, setSelectedSlots] = useState<
    Array<{ date: string; slot: PrivateBookingSlot }>
  >([])
  const [saving, setSaving] = useState(false)
  const savingRef = useRef(false)
  const pendingRequestRef = useRef<{ fingerprint: string; id: string } | null>(null)

  const { isCustomHoliday, isLoading: holidaysLoading, error: holidaysError } = useCustomHolidays({ organizationId })
  const MAX_SELECTIONS = 100

  // 予約受付締切（公演日の何日前まで候補にできるか）。設定 > 予約設定の値
  const { days: minAdvanceDays, loading: deadlineLoading } = usePrivateBookingDeadlineState({ organizationId, scenarioId })

  const { availableDates } = useMemo(() => {
    const dates: string[] = []
    const todayJstStr = getJstDateStringFromNow()
    const minStr = addCalendarDaysYmd(todayJstStr, minAdvanceDays)

    const jstOffsetMin = 9 * 60
    const jstNow = new Date(
      new Date().getTime() + (jstOffsetMin + new Date().getTimezoneOffset()) * 60 * 1000
    )
    const maxFuture = new Date(jstNow.getFullYear(), jstNow.getMonth(), jstNow.getDate() + 180)
    const maxFutureStr = `${maxFuture.getFullYear()}-${String(maxFuture.getMonth() + 1).padStart(2, '0')}-${String(maxFuture.getDate()).padStart(2, '0')}`

    const start = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1)
    const end = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 0)

    const d = new Date(start)
    while (d <= end) {
      const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
      if (dateStr >= minStr && dateStr <= maxFutureStr) {
        dates.push(dateStr)
      }
      d.setDate(d.getDate() + 1)
    }

    return { availableDates: dates }
  }, [currentMonth, minAdvanceDays])

  // 空き判定は DB（保存と同じ判定）。画面では計算しない
  const availabilityTarget = useMemo(() => (isOpen ? { kind: 'group' as const, groupId } : null), [isOpen, groupId])
  const {
    availability,
    loading: availabilityLoading,
    error: availabilityError,
    reload: reloadAvailability,
  } = useCandidateSlotAvailability(availabilityTarget, availableDates)
  const loading = availabilityLoading
  const storeHint = useScenarioStoreHint(isOpen ? organizationId : null, scenarioId, storeIds)

  // 読み直した結果で選べなくなった枠は選択から外す（保存で弾かれる前に）
  useEffect(() => {
    if (loading) return
    setSelectedSlots(prev => {
      const next = prev.filter(({ date, slot }) => !availability.slotsByDate[date] || !availability.unavailableReasons[`${date}-${slot.label}`])
      return next.length === prev.length ? prev : next
    })
  }, [loading, availability])

  const existingSlotKeys = useMemo(() => new Set(existingDates.filter(date => !date.withdrawn_at).map(
    date => `${date.date}-${privateGroupTimeSlotFromDb(date.time_slot)}`
  )), [existingDates])

  const handleMonthChange = (delta: number) => {
    setCurrentMonth(prev => {
      const newMonth = new Date(prev)
      newMonth.setMonth(prev.getMonth() + delta)
      return newMonth
    })
  }

  const isPrevDisabled = useMemo(() => {
    const lastDayOfPrevMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 0)
    const lp = lastDayOfPrevMonth
    const lastPrevStr = `${lp.getFullYear()}-${String(lp.getMonth() + 1).padStart(2, '0')}-${String(lp.getDate()).padStart(2, '0')}`
    const minStr = addCalendarDaysYmd(getJstDateStringFromNow(), minAdvanceDays)
    return lastPrevStr < minStr
  }, [currentMonth, minAdvanceDays])

  const isNextDisabled = useMemo(() => {
    const jstOffsetMin = 9 * 60
    const jstNow = new Date(
      new Date().getTime() + (jstOffsetMin + new Date().getTimezoneOffset()) * 60 * 1000
    )
    const maxFuture = new Date(jstNow.getFullYear(), jstNow.getMonth(), jstNow.getDate() + 180)
    const nextMonthStart = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1)
    return nextMonthStart > maxFuture
  }, [currentMonth])

  // Auto-skip empty months, reset month on open
  useEffect(() => {
    if (!isOpen) {
      wasOpenRef.current = false
      emptyMonthAutoSkipRef.current = 0
      return
    }
    if (loading || deadlineLoading || holidaysLoading || holidaysError) return

    if (!wasOpenRef.current) {
      wasOpenRef.current = true
      emptyMonthAutoSkipRef.current = 0
      setCurrentMonth(getFirstSelectableMonthStart(minAdvanceDays))
      return
    }

    if (availableDates.length > 0) {
      emptyMonthAutoSkipRef.current = 0
      return
    }
    if (emptyMonthAutoSkipRef.current >= 24) return
    emptyMonthAutoSkipRef.current += 1
    setCurrentMonth(prev => new Date(prev.getFullYear(), prev.getMonth() + 1, 1))
  }, [isOpen, loading, deadlineLoading, holidaysLoading, holidaysError, availableDates.length, currentMonth, minAdvanceDays])

  const handleSlotToggle = useCallback((date: string, slot: PrivateBookingSlot) => {
    if (savingRef.current || holidaysLoading || holidaysError) return
    setSelectedSlots(prev => {
      const existingIndex = prev.findIndex(
        s => s.date === date && s.slot.label === slot.label
      )
      if (existingIndex >= 0) {
        return prev.filter((_, i) => i !== existingIndex)
      }
      if (prev.length >= MAX_SELECTIONS) {
        return prev
      }
      return [...prev, { date, slot }].sort((a, b) => {
        if (a.date !== b.date) return a.date.localeCompare(b.date)
        const slotOrder = { '午前': 0, '午後': 1, '夜': 2 }
        return slotOrder[a.slot.label] - slotOrder[b.slot.label]
      })
    })
  }, [MAX_SELECTIONS, holidaysLoading, holidaysError])

  const handleSave = async () => {
    if (selectedSlots.length === 0 || savingRef.current || holidaysLoading || holidaysError || loading || deadlineLoading) return
    savingRef.current = true
    setSaving(true)
    try {
      const candidates = selectedSlots.map(({ date, slot }) => ({
        date,
        time_slot: slot.key,
        start_time: slot.startTime,
        end_time: slot.endTime,
      }))
      const sortedStoreIds = [...storeIds].sort()
      const fingerprint = JSON.stringify({ groupId, scenarioId, storeIds: sortedStoreIds, candidates })
      // 応答だけ失われても、同じ候補の再送は同じ保存要求として扱う。
      if (pendingRequestRef.current?.fingerprint !== fingerprint) {
        pendingRequestRef.current = { fingerprint, id: crypto.randomUUID() }
      }
      await addPrivateGroupCandidates({
        groupId,
        requestId: pendingRequestRef.current.id,
        scenarioId,
        storeIds: sortedStoreIds,
        candidates,
      })
      pendingRequestRef.current = null
      setSelectedSlots([])
      if (!isDialog) setIsOpen(false)
      onDatesAdded()
    } catch (err: unknown) {
      // 弾かれた理由が分かるよう、空き状況を読み直す
      reloadAvailability()
      logger.error('Failed to save candidate dates', err)
      const msg =
        err && typeof err === 'object' && 'message' in err
          ? String((err as { message: string }).message)
          : '候補日の保存に失敗しました'
      const code = err && typeof err === 'object' && 'code' in err ? (err as { code?: string }).code : undefined
      showToast.error(
        code === 'P0045' ? '受付締切を過ぎた候補日があります。日程を選び直してください。'
          : code === 'P0054' ? '作品の公演期間外の候補日があります。期間内の日程を選び直してください。'
            : code === 'P0044' ? 'この作品は現在貸切を募集していません。'
              : msg,
      )
    } finally {
      savingRef.current = false
      setSaving(false)
    }
  }

  /** チップ用の短い日付「10/30(金)」 */
  const formatDate = (dateStr: string) => {
    const p = getJstParts(dateStr)
    return p ? `${Number(p.mo)}/${Number(p.d)}(${p.weekday})` : dateStr
  }

  const noStoresSelected = storeIds.length === 0

  if (!isOpen) {
    return (
      <Button
        variant="outline"
        size="sm"
        onClick={() => setIsOpen(true)}
        disabled={noStoresSelected}
        className="gap-1.5"
        title={noStoresSelected ? '先に希望店舗を設定してください' : undefined}
      >
        <Plus className="w-4 h-4" />
        候補日を追加
      </Button>
    )
  }

  const saveDisabled = selectedSlots.length === 0 || saving || loading || deadlineLoading || holidaysLoading || !!holidaysError
  const inset = isDialog ? 'px-3 sm:px-4' : ''

  const grid = (
    <PrivateBookingSlotGrid
      currentMonth={currentMonth}
      onMonthChange={handleMonthChange}
      isPrevMonthDisabled={isPrevDisabled}
      isNextMonthDisabled={isNextDisabled}
      availableDates={availableDates}
      slotsByDate={availability.slotsByDate}
      selectedSlots={selectedSlots}
      onSlotToggle={handleSlotToggle}
      maxSelections={MAX_SELECTIONS}
      unavailableReasons={availability.unavailableReasons}
      existingSlotKeys={existingSlotKeys}
      isCustomHoliday={isCustomHoliday}
      colorScheme="purple"
      loading={loading || holidaysLoading || deadlineLoading}
      stickyHeader={isDialog}
      insetClassName={inset}
      compact
      emptyMonth={
        <div className="space-y-2 px-2 py-6 text-center text-xs text-muted-foreground">
          <p>今月に選択可能な日がありません。</p>
          <Button type="button" variant="outline" size="sm" onClick={() => handleMonthChange(1)}>
            次月を表示
          </Button>
        </div>
      }
    />
  )

  const notes = (holidaysError || availabilityError || storeHint) && (
    <div className={`space-y-1 py-1.5 ${inset}`}>
      {holidaysError && <p role="alert" className="text-sm text-destructive">{holidaysError}</p>}
      {availabilityError && <p role="alert" className="text-xs text-destructive">{availabilityError}</p>}
      <ScenarioStoreHint hint={storeHint} compact />
    </div>
  )

  // 選択中のチップ列と保存。ダイアログでは画面の下に貼り付け、常に見える位置に置く
  const actions = (
    <div
      className={`border-t border-border bg-background pt-2 ${isDialog ? `sticky bottom-0 z-10 mt-auto pb-[max(0.75rem,env(safe-area-inset-bottom))] ${inset}` : 'pb-1'}`}
      data-testid="candidate-dates-actions"
    >
      {selectedSlots.length > 0 && (
        <div className="mb-2 flex items-center gap-1.5 overflow-x-auto whitespace-nowrap pb-0.5 text-xs" aria-label="選択中の候補日">
          <span className="shrink-0 text-muted-foreground">選択中 {selectedSlots.length} 件</span>
          {selectedSlots.map(slot => (
            <button
              type="button"
              key={`${slot.date}-${slot.slot.label}`}
              className="shrink-0 rounded-full bg-purple-50 px-2.5 py-0.5 text-purple-800 hover:bg-purple-100"
              aria-label={`${formatDate(slot.date)} ${slot.slot.label} を外す`}
              onClick={() => handleSlotToggle(slot.date, slot.slot)}
            >
              {formatDate(slot.date)} {slot.slot.label} ×
            </button>
          ))}
        </div>
      )}
      <div className="flex gap-2">
        <Button variant="outline" className="h-10 flex-1" onClick={cancel} disabled={saving}>
          キャンセル
        </Button>
        <Button
          onClick={handleSave}
          disabled={saveDisabled}
          className="h-10 flex-[2] bg-purple-600 font-bold hover:bg-purple-700"
        >
          {saving ? (
            <>
              <Loader2 className="mr-1 inline h-4 w-4 animate-spin" />
              保存中...
            </>
          ) : selectedSlots.length > 0 ? (
            `候補日を保存（${selectedSlots.length} 件）`
          ) : (
            '候補日を保存'
          )}
        </Button>
      </div>
    </div>
  )

  if (isDialog) {
    return (
      // 中身が短くても保存列は画面の下端に置く（min-h-full + mt-auto）
      <div className="flex min-h-full flex-col" data-testid="add-candidate-dates" data-layout="dialog">
        {notes}
        {grid}
        {belowCalendar && <div className={`pb-3 ${inset}`}>{belowCalendar}</div>}
        {actions}
      </div>
    )
  }

  return (
    // ページ埋め込み: 囲みの枠は置かず（外側の欄がすでに枠）、幅をカレンダーに回す
    <div className="w-full" data-testid="add-candidate-dates" data-layout="embedded">
      <div className="mb-1 flex items-center justify-between gap-1">
        <h3 className="flex items-center gap-1 text-sm font-semibold text-purple-800">
          <Calendar className="h-4 w-4 shrink-0" />
          候補日を追加
        </h3>
        <Button variant="ghost" size="sm" className="h-7 px-2 py-0 text-xs" onClick={() => setIsOpen(false)} disabled={saving}>
          閉じる
        </Button>
      </div>
      {notes}
      {grid}
      {actions}
    </div>
  )
}

import { useState, useCallback, useMemo, useEffect, useRef } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Plus, Loader2, Calendar } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { logger } from '@/utils/logger'
import { useCustomHolidays } from '@/hooks/useCustomHolidays'
import type { PrivateGroupCandidateDate } from '@/types'
import { privateGroupTimeSlotFromDb, privateGroupTimeSlotToDb } from '@/lib/privateGroupTimeSlot'
import { fetchScenarioTimingFromDb, getPrivateBookingDisplayEndTime } from '@/lib/privateBookingScenarioTime'
import type { PrivateBookingSlot } from '@/lib/computePrivateBookingSlots'
import { usePrivateBookingSlotData } from '@/hooks/usePrivateBookingSlotData'
import { PrivateBookingSlotGrid } from '@/components/private-booking/PrivateBookingSlotGrid'
import { showToast } from '@/utils/toast'

const MIN_ADVANCE_DAYS = 14

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

function getFirstSelectableMonthStart(now = new Date()): Date {
  const minStr = addCalendarDaysYmd(getJstDateStringFromNow(now), MIN_ADVANCE_DAYS)
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
  organizerMemberId?: string
}

export function AddCandidateDates({
  groupId,
  organizationId,
  scenarioId,
  storeIds,
  existingDates,
  onDatesAdded,
  organizerMemberId,
}: AddCandidateDatesProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [currentMonth, setCurrentMonth] = useState(() => getFirstSelectableMonthStart())
  const wasOpenRef = useRef(false)
  const emptyMonthAutoSkipRef = useRef(0)
  const [selectedSlots, setSelectedSlots] = useState<
    Array<{ date: string; slot: PrivateBookingSlot }>
  >([])
  const [saving, setSaving] = useState(false)
  const [availabilityMap, setAvailabilityMap] = useState<Record<string, boolean>>({})

  const { isCustomHoliday } = useCustomHolidays()
  const MAX_SELECTIONS = 100

  const { loading, scenarioTiming, computeSlotsByDate } = usePrivateBookingSlotData({
    organizationId,
    scenarioId,
    storeIds,
    isActive: isOpen,
    isCustomHoliday,
  })

  const { availableDates } = useMemo(() => {
    const dates: string[] = []
    const todayJstStr = getJstDateStringFromNow()
    const minStr = addCalendarDaysYmd(todayJstStr, MIN_ADVANCE_DAYS)

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
  }, [currentMonth])

  const slotsByDate = useMemo(
    () => computeSlotsByDate(availableDates),
    [computeSlotsByDate, availableDates]
  )

  // Mark already-existing candidate dates as unavailable
  useEffect(() => {
    if (!isOpen || !scenarioTiming) return

    const newMap: Record<string, boolean> = {}
    for (const date of availableDates) {
      const daySlots = slotsByDate[date] || []
      for (const slot of daySlots) {
        const key = `${date}-${slot.label}`
        const isAlreadySelected = existingDates.some(
          ed => ed.date === date && privateGroupTimeSlotFromDb(ed.time_slot) === slot.label
        )
        newMap[key] = !isAlreadySelected
      }
    }
    setAvailabilityMap(newMap)
  }, [isOpen, availableDates, existingDates, slotsByDate, scenarioTiming])

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
    const minStr = addCalendarDaysYmd(getJstDateStringFromNow(), MIN_ADVANCE_DAYS)
    return lastPrevStr < minStr
  }, [currentMonth])

  // Auto-skip empty months, reset month on open
  useEffect(() => {
    if (!isOpen) {
      wasOpenRef.current = false
      emptyMonthAutoSkipRef.current = 0
      return
    }
    if (loading) return

    if (!wasOpenRef.current) {
      wasOpenRef.current = true
      emptyMonthAutoSkipRef.current = 0
      setCurrentMonth(getFirstSelectableMonthStart())
      return
    }

    if (availableDates.length > 0) {
      emptyMonthAutoSkipRef.current = 0
      return
    }
    if (emptyMonthAutoSkipRef.current >= 24) return
    emptyMonthAutoSkipRef.current += 1
    setCurrentMonth(prev => new Date(prev.getFullYear(), prev.getMonth() + 1, 1))
  }, [isOpen, loading, availableDates.length, currentMonth])

  const handleSlotToggle = useCallback((date: string, slot: PrivateBookingSlot) => {
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
  }, [MAX_SELECTIONS])

  const handleSave = async () => {
    if (selectedSlots.length === 0) return

    const minStr = addCalendarDaysYmd(getJstDateStringFromNow(), MIN_ADVANCE_DAYS)
    const tooSoon = selectedSlots.some(s => s.date < minStr)
    if (tooSoon) {
      showToast.error(`候補日は本日より${MIN_ADVANCE_DAYS}日後以降のみ選べます`)
      return
    }

    setSaving(true)
    try {
      const timing = await fetchScenarioTimingFromDb(supabase, {
        organizationId,
        scenarioLookupId: scenarioId,
        scenarioMasterId: scenarioId,
      })

      const nextOrderNum = existingDates.length > 0
        ? Math.max(...existingDates.map(d => d.order_num)) + 1
        : 1

      const newDates = selectedSlots.map((slot, index) => ({
        group_id: groupId,
        date: slot.date,
        time_slot: privateGroupTimeSlotToDb(slot.slot.label),
        start_time: slot.slot.startTime,
        end_time: getPrivateBookingDisplayEndTime(
          slot.slot.startTime,
          slot.date,
          timing,
          isCustomHoliday
        ),
        order_num: nextOrderNum + index,
      }))

      const { error } = await supabase
        .from('private_group_candidate_dates')
        .insert(newDates)

      if (error) throw error

      if (organizerMemberId) {
        const systemMessage = JSON.stringify({
          type: 'system',
          action: 'candidate_dates_added',
          count: selectedSlots.length,
          dates: selectedSlots.map(s => ({ date: s.date, time_slot: s.slot.label }))
        })

        await supabase.from('private_group_messages').insert({
          group_id: groupId,
          member_id: organizerMemberId,
          message: systemMessage
        })
      }

      setSelectedSlots([])
      setIsOpen(false)
      onDatesAdded()
    } catch (err: unknown) {
      logger.error('Failed to save candidate dates', err)
      const msg =
        err && typeof err === 'object' && 'message' in err
          ? String((err as { message: string }).message)
          : '候補日の保存に失敗しました'
      showToast.error(msg)
    } finally {
      setSaving(false)
    }
  }

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr + 'T00:00:00+09:00')
    const weekdays = ['日', '月', '火', '水', '木', '金', '土']
    return `${date.getMonth() + 1}/${date.getDate()}(${weekdays[date.getDay()]})`
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

  return (
    <Card className="flex w-full min-h-[min(52dvh,360px)] max-h-[min(86dvh,600px)] flex-col overflow-hidden rounded-lg border-purple-200 bg-purple-50 p-0 shadow-none">
      <div className="flex min-h-0 flex-1 flex-col gap-0 overflow-hidden px-1 pb-0 pt-0.5 sm:px-1.5 sm:pt-1">
        <div className="flex shrink-0 items-center justify-between gap-1">
          <h3 className="flex items-center gap-0.5 text-[11px] font-semibold leading-none text-purple-800">
            <Calendar className="h-3 w-3 shrink-0" />
            候補日を追加
          </h3>
          <Button variant="ghost" size="sm" className="h-6 min-h-0 shrink-0 px-1 py-0 text-[10px]" onClick={() => setIsOpen(false)}>
            閉じる
          </Button>
        </div>

        <PrivateBookingSlotGrid
          currentMonth={currentMonth}
          onMonthChange={handleMonthChange}
          isPrevMonthDisabled={isPrevDisabled}
          availableDates={availableDates}
          slotsByDate={slotsByDate}
          selectedSlots={selectedSlots}
          onSlotToggle={handleSlotToggle}
          maxSelections={MAX_SELECTIONS}
          availabilityMap={availabilityMap}
          isCustomHoliday={isCustomHoliday}
          colorScheme="purple"
          loading={loading}
          fillContainer
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

        {selectedSlots.length > 0 && (
          <div className="shrink-0 space-y-px">
            <p className="text-[9px] text-muted-foreground">選択中</p>
            <div className="flex flex-wrap gap-0.5">
              {selectedSlots.map(slot => (
                <Badge
                  key={`${slot.date}-${slot.slot.label}`}
                  variant="outline"
                  className="cursor-pointer border-purple-200 bg-white px-1 py-0 text-[9px] text-purple-800 hover:bg-purple-100"
                  onClick={() => handleSlotToggle(slot.date, slot.slot)}
                >
                  {formatDate(slot.date)} {slot.slot.label} ×
                </Badge>
              ))}
            </div>
          </div>
        )}

        <div
          className="-mx-1 mt-0 flex shrink-0 items-center justify-end gap-0.5 border-t border-purple-200/70 bg-purple-50 px-1 py-0.5 pb-[max(0.2rem,env(safe-area-inset-bottom))] shadow-[0_-1px_6px_rgba(100,50,140,0.06)]"
        >
          <Button variant="ghost" size="sm" className="h-6 min-h-0 px-1 py-0 text-[10px]" onClick={() => setIsOpen(false)}>
            キャンセル
          </Button>
          <Button
            size="sm"
            onClick={handleSave}
            disabled={selectedSlots.length === 0 || saving}
            className="h-6 min-h-0 shrink-0 bg-purple-600 px-2 py-0 text-[10px] hover:bg-purple-700"
          >
            {saving ? (
              <>
                <Loader2 className="mr-0.5 inline h-2.5 w-2.5 animate-spin" />
                保存中...
              </>
            ) : (
              '候補日を保存'
            )}
          </Button>
        </div>
      </div>
    </Card>
  )
}

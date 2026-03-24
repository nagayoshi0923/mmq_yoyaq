import { useState, useCallback, useMemo, useEffect, useRef } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ChevronLeft, ChevronRight, Plus, Loader2, Calendar } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { logger } from '@/utils/logger'
import { isJapaneseHoliday } from '@/utils/japaneseHolidays'
import { useCustomHolidays } from '@/hooks/useCustomHolidays'
import type { PrivateGroupCandidateDate } from '@/types'
import { privateGroupTimeSlotFromDb, privateGroupTimeSlotToDb } from '@/lib/privateGroupTimeSlot'
import { PRIVATE_BOOKING_EVENT_INTERVAL_MINUTES, getPerformanceDurationMinutesForDate } from '@/lib/privateBookingScenarioTime'
import { isJapaneseHoliday as isJpHoliday } from '@/utils/japaneseHolidays'
import {
  getPrivateGroupCandidateSlotsForDate,
  type BusinessHoursSettingRow,
  type PrivateGroupCandidateTimeSlot,
} from '@/lib/privateGroupCandidateSlots'
import { fetchScenarioTimingFromDb, getPrivateBookingDisplayEndTime, type ScenarioTimingFromDb } from '@/lib/privateBookingScenarioTime'
import { isPrivateBookingSlotAvailableOnAnyStore } from '@/lib/privateBookingSlotAvailability'
import { showToast } from '@/utils/toast'

/** 列の並び（設定で枠が無い日は該当セルを無効表示） */
const COLUMN_LABELS: ('午前' | '午後' | '夜')[] = ['午前', '午後', '夜']

/** 貸切候補日は「本日を含めて2週間以内」は選択不可（JST・暦日） */
const MIN_ADVANCE_DAYS = 14

/** JST の基準日を YYYY-MM-DD（.cursorrules 日時ルールに合わせる） */
function getJstDateStringFromNow(now = new Date()): string {
  const jstOffsetMin = 9 * 60
  const jst = new Date(now.getTime() + (jstOffsetMin + now.getTimezoneOffset()) * 60 * 1000)
  return `${jst.getFullYear()}-${String(jst.getMonth() + 1).padStart(2, '0')}-${String(jst.getDate()).padStart(2, '0')}`
}

/** YYYY-MM-DD（暦日）に日数を加算 */
function addCalendarDaysYmd(ymd: string, days: number): string {
  const [y, m, d] = ymd.split('-').map(Number)
  const dt = new Date(y, m - 1, d + days)
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`
}

/** 14日ルール後の最初の日が属する月の1日（カレンダーの初期表示用） */
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
    Array<{ date: string; slot: PrivateGroupCandidateTimeSlot }>
  >([])
  const [saving, setSaving] = useState(false)
  const [availabilityMap, setAvailabilityMap] = useState<Record<string, boolean>>({})
  const [eventsLoading, setEventsLoading] = useState(false)
  const [eventsLoaded, setEventsLoaded] = useState(false)
  const [allStoreEvents, setAllStoreEvents] = useState<any[]>([])
  const [businessHoursByStore, setBusinessHoursByStore] = useState<Map<string, BusinessHoursSettingRow>>(
    new Map()
  )
  const [businessHoursLoaded, setBusinessHoursLoaded] = useState(false)
  const [scenarioTiming, setScenarioTiming] = useState<ScenarioTimingFromDb | null>(null)
  const [scenarioTimingLoaded, setScenarioTimingLoaded] = useState(false)

  const { isCustomHoliday } = useCustomHolidays()
  // 候補日の制限なし（メンバー調整用のため自由に追加可能）
  const MAX_SELECTIONS = 100

  useEffect(() => {
    if (!isOpen) {
      setEventsLoaded(false)
      setBusinessHoursLoaded(false)
      setScenarioTiming(null)
      setScenarioTimingLoaded(false)
      return
    }
    if (storeIds.length === 0) {
      setAllStoreEvents([])
      setBusinessHoursByStore(new Map())
      setEventsLoaded(true)
      setBusinessHoursLoaded(true)
      return
    }

    let cancelled = false

    const loadEvents = async () => {
      setEventsLoading(true)
      setEventsLoaded(false)
      try {
        const today = new Date()
        const windowEnd = new Date(today)
        windowEnd.setDate(today.getDate() + 180)

        const { data, error } = await supabase
          .from('schedule_events')
          .select('*, stores(id, name)')
          .in('store_id', storeIds)
          .gte('date', today.toISOString().split('T')[0])
          .lte('date', windowEnd.toISOString().split('T')[0])
          .eq('is_cancelled', false)

        if (error) throw error
        if (!cancelled) {
          setAllStoreEvents(data || [])
          setEventsLoaded(true)
        }
      } catch (err) {
        logger.error('Failed to load events', err)
        if (!cancelled) {
          setAllStoreEvents([])
          setEventsLoaded(true)
        }
      } finally {
        if (!cancelled) setEventsLoading(false)
      }
    }

    const loadBusinessHours = async () => {
      setBusinessHoursLoaded(false)
      try {
        const { data, error } = await supabase
          .from('business_hours_settings')
          .select('store_id, opening_hours, holidays, special_open_days, special_closed_days')
          .in('store_id', storeIds)

        if (error) throw error
        if (!cancelled) {
          const m = new Map<string, BusinessHoursSettingRow>()
          for (const row of data || []) {
            m.set(row.store_id, row as BusinessHoursSettingRow)
          }
          setBusinessHoursByStore(m)
          setBusinessHoursLoaded(true)
        }
      } catch (err) {
        logger.error('Failed to load business hours', err)
        if (!cancelled) {
          setBusinessHoursByStore(new Map())
          setBusinessHoursLoaded(true)
        }
      }
    }

    loadEvents()
    loadBusinessHours()

    return () => {
      cancelled = true
    }
  }, [isOpen, storeIds])

  useEffect(() => {
    if (!isOpen) return
    if (!organizationId || !scenarioId) {
      setScenarioTiming(null)
      setScenarioTimingLoaded(true)
      return
    }
    let cancelled = false
    setScenarioTimingLoaded(false)
    ;(async () => {
      try {
        const t = await fetchScenarioTimingFromDb(supabase, {
          organizationId,
          scenarioLookupId: scenarioId,
          scenarioMasterId: scenarioId,
        })
        if (!cancelled) setScenarioTiming(t)
      } catch (e) {
        logger.error('Failed to load scenario timing for candidate slots', e)
        if (!cancelled) setScenarioTiming(null)
      } finally {
        if (!cancelled) setScenarioTimingLoaded(true)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [isOpen, organizationId, scenarioId])

  const { availableDates, minSelectableDateStr } = useMemo(() => {
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
      // 本日から数えて15日目以降（2週間以内は不可）かつ180日以内
      if (dateStr >= minStr && dateStr <= maxFutureStr) {
        dates.push(dateStr)
      }
      d.setDate(d.getDate() + 1)
    }

    return {
      availableDates: dates,
      minSelectableDateStr: minStr,
    }
  }, [currentMonth])

  const slotsByDate = useMemo(() => {
    const map: Record<string, PrivateGroupCandidateTimeSlot[]> = {}
    for (const date of availableDates) {
      map[date] = getPrivateGroupCandidateSlotsForDate(
        date,
        storeIds,
        businessHoursByStore,
        isCustomHoliday
      )
    }
    return map
  }, [availableDates, storeIds, businessHoursByStore, isCustomHoliday])

  useEffect(() => {
    if (!isOpen || !businessHoursLoaded || !eventsLoaded || !scenarioTimingLoaded || !scenarioTiming) return

    const newMap: Record<string, boolean> = {}

    for (const date of availableDates) {
      const daySlots = slotsByDate[date] || []

      // 平日判定: 長時間作品では午後→午前に切り替え（排他制御）
      const dateObj = new Date(date + 'T00:00:00+09:00')
      const dow = dateObj.getDay()
      const isWeekendOrHol = dow === 0 || dow === 6 || isJpHoliday(date) || isCustomHoliday(date)

      let weekdayMorningOnly = false
      if (!isWeekendOrHol && scenarioTiming) {
        const dur = getPerformanceDurationMinutesForDate(date, scenarioTiming, isCustomHoliday)
        const extraPrep = scenarioTiming.extra_preparation_time || 0
        const eveningSlot = daySlots.find(s => s.key === 'evening')
        const eveningStart = eveningSlot
          ? parseInt(eveningSlot.startTime.split(':')[0], 10) * 60 +
            parseInt(eveningSlot.startTime.split(':')[1] || '0', 10)
          : 19 * 60
        const deadline = eveningStart - PRIVATE_BOOKING_EVENT_INTERVAL_MINUTES
        const reverseStart = deadline - dur - extraPrep
        const afternoonSlot = daySlots.find(s => s.key === 'afternoon')
        const afternoonDefault = afternoonSlot
          ? parseInt(afternoonSlot.startTime.split(':')[0], 10) * 60 +
            parseInt(afternoonSlot.startTime.split(':')[1] || '0', 10)
          : 13 * 60
        weekdayMorningOnly = reverseStart < afternoonDefault
      }

      for (const slot of daySlots) {
        const key = `${date}-${slot.label}`

        const isAlreadySelected = existingDates.some(
          ed =>
            ed.date === date &&
            privateGroupTimeSlotFromDb(ed.time_slot) === slot.label
        )
        if (isAlreadySelected) {
          newMap[key] = false
          continue
        }

        // 平日排他: 長時間 → 午後を出さない、短時間 → 午前を出さない
        if (!isWeekendOrHol) {
          if (weekdayMorningOnly && slot.key === 'afternoon') {
            newMap[key] = false
            continue
          }
          if (!weekdayMorningOnly && slot.key === 'morning') {
            newMap[key] = false
            continue
          }
        }

        const slotStart =
          parseInt(slot.startTime.split(':')[0], 10) * 60 +
          parseInt(slot.startTime.split(':')[1] || '0', 10)

        // business_hours_settings（営業時間）＋公演隙間。シナリオ詳細の貸切と同じ privateBookingStoreSlotFeasibility 系
        newMap[key] = isPrivateBookingSlotAvailableOnAnyStore(
          date,
          slot.key,
          slotStart,
          scenarioTiming,
          storeIds,
          businessHoursByStore,
          allStoreEvents,
          isCustomHoliday
        )
      }
    }

    setAvailabilityMap(newMap)
  }, [
    isOpen,
    availableDates,
    allStoreEvents,
    existingDates,
    storeIds,
    businessHoursLoaded,
    eventsLoaded,
    slotsByDate,
    scenarioTiming,
    scenarioTimingLoaded,
    isCustomHoliday,
  ])

  const loadingData = eventsLoading || !businessHoursLoaded || !scenarioTimingLoaded

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

  // 開いた直後は必ず「14日ルール後の最初の月」へ。表示月に候補日が0件なら次月へ進める（最大24ヶ月）
  useEffect(() => {
    if (!isOpen) {
      wasOpenRef.current = false
      emptyMonthAutoSkipRef.current = 0
      return
    }
    if (loadingData) return

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
  }, [isOpen, loadingData, availableDates.length, currentMonth])

  const isSlotSelected = (date: string, slot: PrivateGroupCandidateTimeSlot): boolean => {
    return selectedSlots.some(s => s.date === date && s.slot.label === slot.label)
  }

  const handleSlotToggle = useCallback((date: string, slot: PrivateGroupCandidateTimeSlot) => {
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
      const scenarioTiming = await fetchScenarioTimingFromDb(supabase, {
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
          scenarioTiming,
          isCustomHoliday
        ),
        order_num: nextOrderNum + index,
      }))

      const { error } = await supabase
        .from('private_group_candidate_dates')
        .insert(newDates)

      if (error) throw error

      // チャットにシステムメッセージを投稿
      if (organizerMemberId) {
        const datesSummary = selectedSlots.map(slot => {
          const date = new Date(slot.date + 'T00:00:00+09:00')
          const weekdays = ['日', '月', '火', '水', '木', '金', '土']
          return `${date.getMonth() + 1}/${date.getDate()}(${weekdays[date.getDay()]}) ${slot.slot.label}`
        }).join('\n')

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

  if (!isOpen) {
    return (
      <Button
        variant="outline"
        size="sm"
        onClick={() => setIsOpen(true)}
        className="gap-1.5"
      >
        <Plus className="w-4 h-4" />
        候補日を追加
      </Button>
    )
  }

  return (
    <Card className="flex w-full min-h-[min(52dvh,360px)] max-h-[min(86dvh,600px)] flex-col overflow-hidden rounded-lg border-purple-200 bg-purple-50 p-0 shadow-none">
      {/* CardContent は p-3/md:p-6 のデフォルトが残るため、余白ゼロの div を使う */}
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

        {loadingData ? (
          <div className="flex items-center justify-center gap-1.5 py-3 text-[11px] text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            読み込み中...
          </div>
        ) : (
          <>
            <div className="flex shrink-0 items-center justify-between px-0">
              <button
                type="button"
                onClick={() => handleMonthChange(-1)}
                disabled={isPrevDisabled}
                className="flex items-center gap-0 px-0.5 py-0 text-[11px] text-muted-foreground hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
              >
                <ChevronLeft className="h-3 w-3" />
                前月
              </button>
              <span className="text-[11px] font-medium tabular-nums">
                {currentMonth.getFullYear()}年{currentMonth.getMonth() + 1}月
              </span>
              <button
                type="button"
                onClick={() => handleMonthChange(1)}
                className="flex items-center gap-0 px-0.5 py-0 text-[11px] text-muted-foreground hover:text-foreground"
              >
                次月
                <ChevronRight className="h-3 w-3" />
              </button>
            </div>

            <p className="shrink-0 py-px text-center text-[8px] leading-none text-muted-foreground">
              {selectedSlots.length === 0 ? (
                <>
                  タップで選択
                  <span className="text-gray-400"> ・{MIN_ADVANCE_DAYS}日後以降</span>
                </>
              ) : (
                <>
                  <span className="font-medium text-purple-600">{selectedSlots.length}件</span> 選択中
                  <span className="text-gray-400">（複数可）</span>
                </>
              )}
            </p>

            {/* min-h-0 必須: 無いと flex 子が中身の高さまで伸び、max-h でフッターが切れる */}
            <div className="min-h-0 flex-1 basis-0 overflow-y-auto rounded-sm border border-gray-200/90 bg-white px-1 py-1 sm:px-1.5 sm:py-1.5">
            {availableDates.length === 0 ? (
              <div className="space-y-2 px-2 py-6 text-center text-xs text-muted-foreground">
                <p>今月に選択可能な日がありません。</p>
                <Button type="button" variant="outline" size="sm" onClick={() => handleMonthChange(1)}>
                  次月を表示
                </Button>
              </div>
            ) : (
            <>
              {/* ヘッダー行 */}
              <div className="mb-1 flex items-center gap-1 border-b border-gray-200 pb-1">
                <div className="w-10 shrink-0 sm:w-11" />
                {COLUMN_LABELS.map(label => (
                  <div key={label} className="flex-1 text-center text-[9px] text-muted-foreground sm:text-[10px]">
                    {label}
                  </div>
                ))}
              </div>
              <p className="mb-1 hidden text-center text-[9px] leading-snug text-muted-foreground sm:block">
                時刻は店舗の営業設定に基づきます
              </p>

              {availableDates.map(date => {
                const dateObj = new Date(date + 'T00:00:00+09:00')
                const month = dateObj.getMonth() + 1
                const day = dateObj.getDate()
                const weekdays = ['日', '月', '火', '水', '木', '金', '土']
                const weekday = weekdays[dateObj.getDay()]

                const dayOfWeek = dateObj.getDay()
                const isHoliday = isJapaneseHoliday(date) || isCustomHoliday(date)
                const weekdayColor =
                  isHoliday || dayOfWeek === 0
                    ? 'text-red-600'
                    : dayOfWeek === 6
                    ? 'text-blue-600'
                    : ''

                const daySlots = slotsByDate[date] || []

                return (
                  <div
                    key={date}
                    className="flex items-stretch gap-1 border-b border-gray-100 py-1 last:border-b-0 sm:gap-1.5 sm:py-1.5"
                  >
                    <div className="flex w-10 shrink-0 flex-col justify-center gap-0.5 text-center leading-tight sm:w-11">
                      <div className="text-[11px] font-bold tabular-nums">{month}/{day}</div>
                      <div className={`text-[9px] ${weekdayColor}`}>({weekday})</div>
                    </div>

                    {COLUMN_LABELS.map(label => {
                      const slot = daySlots.find(s => s.label === label)
                      if (!slot) {
                        return (
                          <div
                            key={label}
                            className="flex min-h-[2.35rem] flex-1 cursor-not-allowed items-center justify-center rounded border border-gray-100 bg-gray-50 px-1 py-1.5 text-center opacity-40 sm:min-h-0 sm:py-2"
                          >
                            <div className="text-[10px] text-muted-foreground">—</div>
                          </div>
                        )
                      }

                      const key = `${date}-${slot.label}`
                      const isAvailable = availabilityMap[key] ?? true
                      const isSelected = isSlotSelected(date, slot)
                      const canSelect = isAvailable && (isSelected || selectedSlots.length < MAX_SELECTIONS)
                      const displayEnd =
                        scenarioTiming != null
                          ? getPrivateBookingDisplayEndTime(
                              slot.startTime,
                              date,
                              {
                                duration: scenarioTiming.duration,
                                weekend_duration: scenarioTiming.weekend_duration,
                              },
                              isCustomHoliday
                            )
                          : slot.endTime

                      return (
                        <button
                          key={slot.label}
                          type="button"
                          className={`flex-1 rounded border px-1 py-1.5 text-center leading-tight transition-colors sm:px-1 sm:py-2 ${
                            !isAvailable
                              ? 'cursor-not-allowed border-gray-100 bg-gray-100 opacity-50'
                              : isSelected
                              ? 'border-purple-600 bg-purple-600 text-white'
                              : canSelect
                              ? 'border-gray-200 hover:border-purple-300 hover:bg-purple-50'
                              : 'cursor-not-allowed border-gray-100 bg-gray-50 opacity-50'
                          }`}
                          disabled={!canSelect}
                          onClick={() => canSelect && handleSlotToggle(date, slot)}
                        >
                          <div className="text-[11px] font-medium sm:text-xs">{slot.label}</div>
                          <div
                            className={`mt-0.5 text-[8px] leading-snug sm:text-[9px] ${
                              isSelected ? 'text-purple-100' : 'text-muted-foreground'
                            }`}
                          >
                            {slot.startTime}〜{displayEnd}
                          </div>
                        </button>
                      )
                    })}
                  </div>
                )
              })}
            </>
            )}
            </div>

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

            {/* flex 列の最後＋ shrink-0。表エリアは min-h-0 で縮むので常にカード下端に収まる */}
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
          </>
        )}
      </div>
    </Card>
  )
}

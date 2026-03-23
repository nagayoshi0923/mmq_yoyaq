import { useState, useCallback, useMemo, useEffect } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ChevronLeft, ChevronRight, Plus, Loader2, Calendar } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { logger } from '@/utils/logger'
import { isJapaneseHoliday } from '@/utils/japaneseHolidays'
import { useCustomHolidays } from '@/hooks/useCustomHolidays'
import type { PrivateGroupCandidateDate } from '@/types'
import { privateGroupTimeSlotFromDb, privateGroupTimeSlotToDb } from '@/lib/privateGroupTimeSlot'
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
  const [currentMonth, setCurrentMonth] = useState(() => new Date())
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

  const availableDates = useMemo(() => {
    const dates: string[] = []
    
    // JST基準で今日の日付を取得
    const now = new Date()
    const jstOffset = 9 * 60 // JST は UTC+9
    const jstNow = new Date(now.getTime() + (jstOffset + now.getTimezoneOffset()) * 60 * 1000)
    const todayStr = `${jstNow.getFullYear()}-${String(jstNow.getMonth() + 1).padStart(2, '0')}-${String(jstNow.getDate()).padStart(2, '0')}`

    const start = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1)
    const end = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 0)

    // 180日後まで
    const maxFuture = new Date(jstNow)
    maxFuture.setDate(maxFuture.getDate() + 180)
    const maxFutureStr = `${maxFuture.getFullYear()}-${String(maxFuture.getMonth() + 1).padStart(2, '0')}-${String(maxFuture.getDate()).padStart(2, '0')}`

    const d = new Date(start)
    while (d <= end) {
      const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
      // 今日以降かつ180日以内
      if (dateStr >= todayStr && dateStr <= maxFutureStr) {
        dates.push(dateStr)
      }
      d.setDate(d.getDate() + 1)
    }

    return dates
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

        const slotStart =
          parseInt(slot.startTime.split(':')[0], 10) * 60 +
          parseInt(slot.startTime.split(':')[1] || '0', 10)
        const slotEnd =
          parseInt(slot.endTime.split(':')[0], 10) * 60 +
          parseInt(slot.endTime.split(':')[1] || '0', 10)

        // 通常貸切（シナリオ詳細）と同一の空き判定
        newMap[key] = isPrivateBookingSlotAvailableOnAnyStore(
          date,
          slotStart,
          slotEnd,
          scenarioTiming,
          storeIds,
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
    const today = new Date()
    return (
      currentMonth.getMonth() === today.getMonth() &&
      currentMonth.getFullYear() === today.getFullYear()
    )
  }, [currentMonth])

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
    <Card className="border-purple-200 bg-purple-50">
      <CardContent className="p-4 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-purple-800 flex items-center gap-2">
            <Calendar className="w-4 h-4" />
            候補日を追加
          </h3>
          <Button variant="ghost" size="sm" onClick={() => setIsOpen(false)}>
            閉じる
          </Button>
        </div>

        {loadingData ? (
          <div className="flex items-center justify-center py-8 gap-2 text-muted-foreground">
            <Loader2 className="w-5 h-5 animate-spin" />
            営業時間・空き状況を読み込み中...
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between">
              <button
                onClick={() => handleMonthChange(-1)}
                disabled={isPrevDisabled}
                className="text-sm text-muted-foreground hover:text-foreground disabled:opacity-40 disabled:cursor-not-allowed px-2 py-1 flex items-center gap-1"
              >
                <ChevronLeft className="w-4 h-4" />
                前月
              </button>
              <span className="text-sm font-medium">
                {currentMonth.getFullYear()}年{currentMonth.getMonth() + 1}月
              </span>
              <button
                onClick={() => handleMonthChange(1)}
                className="text-sm text-muted-foreground hover:text-foreground px-2 py-1 flex items-center gap-1"
              >
                次月
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>

            <div className="text-xs text-muted-foreground text-center">
              {selectedSlots.length === 0 ? (
                <span>メンバーに確認したい候補日時を選択してください</span>
              ) : (
                <span>
                  <span className="font-medium text-purple-600">{selectedSlots.length}件</span>選択中
                  <span className="ml-2 text-gray-400">（制限なし・複数選択可）</span>
                </span>
              )}
            </div>

            <div className="max-h-[320px] overflow-y-auto border rounded-lg p-3 bg-white">
              {/* ヘッダー行 */}
              <div className="flex items-center gap-3 pb-2 border-b border-gray-200 mb-2">
                <div className="w-14"></div>
                {COLUMN_LABELS.map(label => (
                  <div key={label} className="flex-1 text-center text-xs text-muted-foreground">
                    {label}
                  </div>
                ))}
              </div>
              <p className="text-[10px] text-muted-foreground text-center -mt-1 mb-2">
                各枠の時刻は店舗の営業時間設定（公演枠・開始時刻）に基づきます
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
                    className="flex items-center gap-3 py-2 border-b border-gray-100 last:border-b-0"
                  >
                    <div className="flex-shrink-0 w-14 text-center">
                      <div className="text-sm font-bold">{month}/{day}</div>
                      <div className={`text-xs ${weekdayColor}`}>({weekday})</div>
                    </div>

                    {COLUMN_LABELS.map(label => {
                      const slot = daySlots.find(s => s.label === label)
                      if (!slot) {
                        return (
                          <div
                            key={label}
                            className="flex-1 py-2.5 px-2 border border-gray-100 bg-gray-50 text-center rounded-lg opacity-40 cursor-not-allowed"
                          >
                            <div className="text-xs text-muted-foreground">—</div>
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
                          className={`flex-1 py-2.5 px-2 border text-center rounded-lg transition-colors ${
                            !isAvailable
                              ? 'border-gray-100 bg-gray-100 cursor-not-allowed opacity-50'
                              : isSelected
                              ? 'bg-purple-600 text-white border-purple-600'
                              : canSelect
                              ? 'border-gray-200 hover:border-purple-300 hover:bg-purple-50'
                              : 'border-gray-100 bg-gray-50 cursor-not-allowed opacity-50'
                          }`}
                          disabled={!canSelect}
                          onClick={() => canSelect && handleSlotToggle(date, slot)}
                        >
                          <div className="text-sm font-medium">{slot.label}</div>
                          <div
                            className={`text-[10px] mt-0.5 ${
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
            </div>

            {selectedSlots.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground">選択中:</p>
                <div className="flex flex-wrap gap-1.5">
                  {selectedSlots.map((slot, index) => (
                    <Badge
                      key={`${slot.date}-${slot.slot.label}`}
                      variant="outline"
                      className="bg-white text-purple-800 border-purple-200 px-2 py-1 text-xs cursor-pointer hover:bg-purple-100"
                      onClick={() => handleSlotToggle(slot.date, slot.slot)}
                    >
                      {formatDate(slot.date)} {slot.slot.label} ×
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            <div className="flex gap-2 justify-end">
              <Button variant="ghost" size="sm" onClick={() => setIsOpen(false)}>
                キャンセル
              </Button>
              <Button
                size="sm"
                onClick={handleSave}
                disabled={selectedSlots.length === 0 || saving}
                className="bg-purple-600 hover:bg-purple-700"
              >
                {saving ? '保存中...' : '候補日を保存'}
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}

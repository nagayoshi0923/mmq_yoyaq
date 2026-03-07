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

interface TimeSlot {
  label: '午前' | '午後' | '夜間'
  startTime: string
  endTime: string
}

const TIME_SLOTS: TimeSlot[] = [
  { label: '午前', startTime: '10:00', endTime: '13:00' },
  { label: '午後', startTime: '13:00', endTime: '17:00' },
  { label: '夜間', startTime: '18:00', endTime: '22:00' },
]

interface AddCandidateDatesProps {
  groupId: string
  scenarioId: string
  storeIds: string[]
  existingDates: PrivateGroupCandidateDate[]
  onDatesAdded: () => void
}

export function AddCandidateDates({
  groupId,
  scenarioId,
  storeIds,
  existingDates,
  onDatesAdded,
}: AddCandidateDatesProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [currentMonth, setCurrentMonth] = useState(() => new Date())
  const [selectedSlots, setSelectedSlots] = useState<Array<{ date: string; slot: TimeSlot }>>([])
  const [saving, setSaving] = useState(false)
  const [availabilityMap, setAvailabilityMap] = useState<Record<string, boolean>>({})
  const [checkingAvailability, setCheckingAvailability] = useState(false)
  const [allStoreEvents, setAllStoreEvents] = useState<any[]>([])
  
  const { isCustomHoliday } = useCustomHolidays()
  const MAX_SELECTIONS = 6 - existingDates.length

  useEffect(() => {
    const loadEvents = async () => {
      if (!isOpen || storeIds.length === 0) return
      
      setCheckingAvailability(true)
      try {
        const today = new Date()
        const threeMonthsLater = new Date(today)
        threeMonthsLater.setMonth(today.getMonth() + 3)

        const { data, error } = await supabase
          .from('schedule_events')
          .select('*, stores(id, name)')
          .in('store_id', storeIds)
          .gte('date', today.toISOString().split('T')[0])
          .lte('date', threeMonthsLater.toISOString().split('T')[0])
          .eq('is_cancelled', false)

        if (error) throw error
        setAllStoreEvents(data || [])
      } catch (err) {
        logger.error('Failed to load events', err)
      } finally {
        setCheckingAvailability(false)
      }
    }

    loadEvents()
  }, [isOpen, storeIds])

  const availableDates = useMemo(() => {
    const dates: string[] = []
    const today = new Date()
    today.setHours(0, 0, 0, 0)

    const start = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1)
    const end = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 0)

    const maxFuture = new Date(today)
    maxFuture.setDate(maxFuture.getDate() + 90)

    const d = new Date(start)
    while (d <= end) {
      if (d >= today && d <= maxFuture) {
        dates.push(d.toISOString().split('T')[0])
      }
      d.setDate(d.getDate() + 1)
    }

    return dates
  }, [currentMonth])

  useEffect(() => {
    if (!isOpen || allStoreEvents.length === 0) return

    const checkAvailability = async () => {
      const newMap: Record<string, boolean> = {}

      for (const date of availableDates) {
        for (const slot of TIME_SLOTS) {
          const key = `${date}-${slot.label}`
          
          const isAlreadySelected = existingDates.some(
            ed => ed.date === date && ed.time_slot === slot.label
          )
          if (isAlreadySelected) {
            newMap[key] = false
            continue
          }

          const hasConflict = allStoreEvents.some(event => {
            if (event.date !== date) return false
            
            const eventStart = event.start_time ? 
              parseInt(event.start_time.split(':')[0]) * 60 + parseInt(event.start_time.split(':')[1] || '0') : 0
            const eventEnd = event.end_time ?
              parseInt(event.end_time.split(':')[0]) * 60 + parseInt(event.end_time.split(':')[1] || '0') : eventStart + 240

            const slotStart = parseInt(slot.startTime.split(':')[0]) * 60 + parseInt(slot.startTime.split(':')[1])
            const slotEnd = parseInt(slot.endTime.split(':')[0]) * 60 + parseInt(slot.endTime.split(':')[1])

            return eventStart < slotEnd && eventEnd > slotStart
          })

          const allStoresHaveConflict = storeIds.every(storeId => {
            return allStoreEvents.some(event => {
              if (event.date !== date || event.store_id !== storeId) return false
              
              const eventStart = event.start_time ? 
                parseInt(event.start_time.split(':')[0]) * 60 + parseInt(event.start_time.split(':')[1] || '0') : 0
              const eventEnd = event.end_time ?
                parseInt(event.end_time.split(':')[0]) * 60 + parseInt(event.end_time.split(':')[1] || '0') : eventStart + 240

              const slotStart = parseInt(slot.startTime.split(':')[0]) * 60 + parseInt(slot.startTime.split(':')[1])
              const slotEnd = parseInt(slot.endTime.split(':')[0]) * 60 + parseInt(slot.endTime.split(':')[1])

              return eventStart < slotEnd && eventEnd > slotStart
            })
          })

          newMap[key] = !allStoresHaveConflict
        }
      }

      setAvailabilityMap(newMap)
    }

    checkAvailability()
  }, [isOpen, availableDates, allStoreEvents, existingDates, storeIds])

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

  const isSlotSelected = (date: string, slot: TimeSlot): boolean => {
    return selectedSlots.some(s => s.date === date && s.slot.label === slot.label)
  }

  const handleSlotToggle = useCallback((date: string, slot: TimeSlot) => {
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
        const slotOrder = { '午前': 0, '午後': 1, '夜間': 2 }
        return slotOrder[a.slot.label] - slotOrder[b.slot.label]
      })
    })
  }, [MAX_SELECTIONS])

  const handleSave = async () => {
    if (selectedSlots.length === 0) return

    setSaving(true)
    try {
      const nextOrderNum = existingDates.length > 0 
        ? Math.max(...existingDates.map(d => d.order_num)) + 1 
        : 1

      const newDates = selectedSlots.map((slot, index) => ({
        group_id: groupId,
        date: slot.date,
        time_slot: slot.slot.label,
        start_time: slot.slot.startTime,
        end_time: slot.slot.endTime,
        order_num: nextOrderNum + index,
      }))

      const { error } = await supabase
        .from('private_group_candidate_dates')
        .insert(newDates)

      if (error) throw error

      setSelectedSlots([])
      setIsOpen(false)
      onDatesAdded()
    } catch (err) {
      logger.error('Failed to save candidate dates', err)
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
        disabled={MAX_SELECTIONS <= 0}
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

        {checkingAvailability ? (
          <div className="flex items-center justify-center py-8 gap-2 text-muted-foreground">
            <Loader2 className="w-5 h-5 animate-spin" />
            空き状況を確認中...
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
                <span>候補日時を選択してください（最大{MAX_SELECTIONS}件）</span>
              ) : (
                <span>
                  <span className="font-medium text-purple-600">{selectedSlots.length}件</span>選択中
                  {MAX_SELECTIONS - selectedSlots.length > 0 && (
                    <>
                      <span className="mx-1">･</span>
                      あと<span className="font-medium">{MAX_SELECTIONS - selectedSlots.length}件</span>選択可能
                    </>
                  )}
                </span>
              )}
            </div>

            <div className="max-h-[280px] overflow-y-auto border rounded-lg p-2 bg-white">
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

                return (
                  <div
                    key={date}
                    className="flex items-center gap-2 py-1.5 border-b border-gray-100 last:border-b-0"
                  >
                    <div className="flex-shrink-0 w-12 text-center">
                      <div className="text-sm font-medium">{month}/{day}</div>
                      <div className={`text-xs ${weekdayColor}`}>({weekday})</div>
                    </div>

                    <div className="flex gap-1.5 flex-1">
                      {TIME_SLOTS.map(slot => {
                        const key = `${date}-${slot.label}`
                        const isAvailable = availabilityMap[key] ?? true
                        const isSelected = isSlotSelected(date, slot)
                        const canSelect = isAvailable && (isSelected || selectedSlots.length < MAX_SELECTIONS)

                        return (
                          <button
                            key={slot.label}
                            className={`flex-1 py-1.5 px-1 border text-center rounded transition-colors ${
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
                            <div className="text-xs font-medium">{slot.label}</div>
                            <div className="text-[10px] opacity-70">
                              {slot.startTime}〜
                            </div>
                          </button>
                        )
                      })}
                    </div>
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

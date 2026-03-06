import { useState, useMemo, memo } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { isJapaneseHoliday } from '@/utils/japaneseHolidays'

interface TimeSlot {
  label: '午前' | '午後' | '夜間'
  startTime: string
  endTime: string
}

interface CandidateDate {
  date: string
  slot: TimeSlot
}

interface GroupCalendarSelectorProps {
  selectedSlots: CandidateDate[]
  onSlotToggle: (date: string, slot: TimeSlot) => void
  maxSelections: number
  isCustomHoliday?: (date: string) => boolean
}

const TIME_SLOTS: TimeSlot[] = [
  { label: '午前', startTime: '09:00', endTime: '12:00' },
  { label: '午後', startTime: '12:00', endTime: '17:00' },
  { label: '夜間', startTime: '17:00', endTime: '22:00' },
]

export const GroupCalendarSelector = memo(function GroupCalendarSelector({
  selectedSlots,
  onSlotToggle,
  maxSelections,
  isCustomHoliday,
}: GroupCalendarSelectorProps) {
  const [currentMonth, setCurrentMonth] = useState(() => {
    const today = new Date()
    return new Date(today.getFullYear(), today.getMonth(), 1)
  })

  const remainingSelections = maxSelections - selectedSlots.length

  const handleMonthChange = (delta: number) => {
    setCurrentMonth((prev) => {
      const newMonth = new Date(prev)
      newMonth.setMonth(prev.getMonth() + delta)
      return newMonth
    })
  }

  const isSlotSelected = (date: string, slot: TimeSlot): boolean => {
    return selectedSlots.some((s) => s.date === date && s.slot.label === slot.label)
  }

  const canSelectMore = remainingSelections > 0

  const availableDates = useMemo(() => {
    const dates: string[] = []
    const today = new Date()
    today.setHours(0, 0, 0, 0)

    const start = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1)
    const end = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 0)

    const maxFuture = new Date(today)
    maxFuture.setDate(maxFuture.getDate() + 60)

    const d = new Date(start)
    while (d <= end) {
      if (d >= today && d <= maxFuture) {
        dates.push(d.toISOString().split('T')[0])
      }
      d.setDate(d.getDate() + 1)
    }

    return dates
  }, [currentMonth])

  const isPrevDisabled = useMemo(() => {
    const today = new Date()
    return (
      currentMonth.getMonth() === today.getMonth() &&
      currentMonth.getFullYear() === today.getFullYear()
    )
  }, [currentMonth])

  return (
    <div>
      <h3 className="text-sm font-medium text-muted-foreground mb-1.5">候補日時を選択</h3>

      <div className="flex items-center justify-between mb-2">
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
          <span className="text-orange-600 font-medium">
            選択上限に達しました（{maxSelections}件）
          </span>
        )}
      </div>

      <div className="max-h-[320px] overflow-y-auto border rounded-lg p-2">
        {availableDates.length === 0 ? (
          <div className="text-center py-8 text-sm text-muted-foreground">
            この月に選択可能な日付はありません
          </div>
        ) : (
          availableDates.map((date) => {
            const dateObj = new Date(date + 'T00:00:00+09:00')
            const month = dateObj.getMonth() + 1
            const day = dateObj.getDate()
            const weekdays = ['日', '月', '火', '水', '木', '金', '土']
            const weekday = weekdays[dateObj.getDay()]

            const dayOfWeek = dateObj.getDay()
            const isHoliday = isJapaneseHoliday(date) || isCustomHoliday?.(date)
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
                  <div className="text-sm font-medium">
                    {month}/{day}
                  </div>
                  <div className={`text-xs ${weekdayColor}`}>({weekday})</div>
                </div>

                <div className="flex gap-1.5 flex-1">
                  {TIME_SLOTS.map((slot) => {
                    const isSelected = isSlotSelected(date, slot)
                    const isDisabled = !isSelected && !canSelectMore

                    return (
                      <button
                        key={slot.label}
                        className={`flex-1 py-1.5 px-1 border text-center rounded transition-colors ${
                          isDisabled
                            ? 'border-gray-100 bg-gray-50 cursor-not-allowed opacity-50'
                            : isSelected
                            ? 'bg-purple-600 text-white border-purple-600'
                            : 'border-gray-200 hover:border-purple-300 hover:bg-purple-50'
                        }`}
                        disabled={isDisabled}
                        onClick={() => !isDisabled && onSlotToggle(date, slot)}
                      >
                        <div className="text-xs font-medium">{slot.label}</div>
                        <div className="text-[10px] opacity-70">
                          {slot.startTime}〜{slot.endTime}
                        </div>
                      </button>
                    )
                  })}
                </div>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
})

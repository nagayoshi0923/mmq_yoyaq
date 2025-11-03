import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { ChevronLeft, ChevronRight } from 'lucide-react'

interface CustomDatePickerProps {
  value?: string // YYYY-MM-DD
  onChange: (date: string) => void
  label: string
}

export function CustomDatePicker({ value, onChange, label }: CustomDatePickerProps) {
  const currentDate = value ? new Date(value) : new Date()
  const [viewYear, setViewYear] = useState(currentDate.getFullYear())
  const [viewMonth, setViewMonth] = useState(currentDate.getMonth())

  const getDaysInMonth = (year: number, month: number) => {
    return new Date(year, month + 1, 0).getDate()
  }

  const getFirstDayOfMonth = (year: number, month: number) => {
    return new Date(year, month, 1).getDay()
  }

  const handleDateClick = (day: number) => {
    const year = viewYear
    const month = viewMonth + 1
    const dayStr = String(day).padStart(2, '0')
    const monthStr = String(month).padStart(2, '0')
    onChange(`${year}-${monthStr}-${dayStr}`)
  }

  const handlePrevMonth = () => {
    if (viewMonth === 0) {
      setViewMonth(11)
      setViewYear(viewYear - 1)
    } else {
      setViewMonth(viewMonth - 1)
    }
  }

  const handleNextMonth = () => {
    if (viewMonth === 11) {
      setViewMonth(0)
      setViewYear(viewYear + 1)
    } else {
      setViewMonth(viewMonth + 1)
    }
  }

  const daysInMonth = getDaysInMonth(viewYear, viewMonth)
  const firstDay = getFirstDayOfMonth(viewYear, viewMonth)
  const days = Array.from({ length: daysInMonth }, (_, i) => i + 1)
  const blanks = Array.from({ length: firstDay }, (_, i) => i)

  const selectedDate = value ? new Date(value) : null
  const isSelectedDate = (day: number) => {
    if (!selectedDate) return false
    return (
      selectedDate.getFullYear() === viewYear &&
      selectedDate.getMonth() === viewMonth &&
      selectedDate.getDate() === day
    )
  }

  const monthNames = [
    '1月', '2月', '3月', '4月', '5月', '6月',
    '7月', '8月', '9月', '10月', '11月', '12月'
  ]

  return (
    <div>
      <p className="text-sm font-medium mb-3">{label}</p>
      
      {/* 年月選択 */}
      <div className="flex items-center justify-between mb-4">
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="h-8 w-8"
          onClick={handlePrevMonth}
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <div className="text-sm font-semibold">
          {viewYear}年 {monthNames[viewMonth]}
        </div>
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="h-8 w-8"
          onClick={handleNextMonth}
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      {/* 曜日ヘッダー */}
      <div className="grid grid-cols-7 gap-1 mb-2">
        {['日', '月', '火', '水', '木', '金', '土'].map((day, index) => (
          <div
            key={day}
            className={`text-center text-xs font-medium py-2 ${
              index === 0 ? 'text-red-500' : index === 6 ? 'text-blue-500' : 'text-muted-foreground'
            }`}
          >
            {day}
          </div>
        ))}
      </div>

      {/* 日付グリッド */}
      <div className="grid grid-cols-7 gap-1">
        {blanks.map((blank) => (
          <div key={`blank-${blank}`} className="aspect-square" />
        ))}
        {days.map((day) => {
          const isSelected = isSelectedDate(day)
          return (
            <Button
              key={day}
              type="button"
              variant={isSelected ? "default" : "ghost"}
              className={`aspect-square p-0 text-sm ${
                isSelected ? 'bg-primary text-primary-foreground font-semibold' : ''
              }`}
              onClick={() => handleDateClick(day)}
            >
              {day}
            </Button>
          )
        })}
      </div>
    </div>
  )
}


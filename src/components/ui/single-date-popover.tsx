import React, { useState } from 'react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Button } from '@/components/ui/button'
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight } from 'lucide-react'

interface SingleDatePopoverProps {
  date?: string  // YYYY-MM-DD 形式
  onDateChange: (date?: string) => void
  label?: string
  placeholder?: string
  buttonClassName?: string
}

export function SingleDatePopover({
  date,
  onDateChange,
  label,
  placeholder = '日付を選択',
  buttonClassName = ''
}: SingleDatePopoverProps) {
  const [open, setOpen] = useState(false)
  const [tempDate, setTempDate] = useState(date || '')

  // Popoverが開かれたときに現在の値をリセット
  React.useEffect(() => {
    if (open) {
      setTempDate(date || '')
    }
  }, [open, date])

  const handleSave = () => {
    onDateChange(tempDate || undefined)
    setOpen(false)
  }

  const handleClear = () => {
    setTempDate('')
    onDateChange(undefined)
    setOpen(false)
  }

  const handleDateClick = (dateStr: string) => {
    setTempDate(dateStr)
  }

  // 表示用のフォーマット（日本語形式）
  const getDisplayValue = () => {
    if (label) return label
    if (!date) return placeholder
    const d = new Date(date + 'T00:00:00')
    return d.toLocaleDateString('ja-JP', { 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric',
      weekday: 'short'
    })
  }

  // カレンダーUI
  const currentDate = tempDate ? new Date(tempDate) : new Date()
  const [viewYear, setViewYear] = useState(currentDate.getFullYear())
  const [viewMonth, setViewMonth] = useState(currentDate.getMonth())

  React.useEffect(() => {
    if (tempDate) {
      const d = new Date(tempDate)
      setViewYear(d.getFullYear())
      setViewMonth(d.getMonth())
    }
  }, [tempDate])

  const getDaysInMonth = (year: number, month: number) => {
    return new Date(year, month + 1, 0).getDate()
  }

  const getFirstDayOfMonth = (year: number, month: number) => {
    return new Date(year, month, 1).getDay()
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

  const isSelected = (day: number) => {
    if (!tempDate) return false
    const d = new Date(tempDate)
    return (
      d.getFullYear() === viewYear &&
      d.getMonth() === viewMonth &&
      d.getDate() === day
    )
  }

  const monthNames = [
    '1月', '2月', '3月', '4月', '5月', '6月',
    '7月', '8月', '9月', '10月', '11月', '12月'
  ]

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          className={`w-full justify-start text-left font-normal ${!date && 'text-muted-foreground'} ${buttonClassName}`}
        >
          <CalendarIcon className="mr-2 h-4 w-4" />
          {getDisplayValue()}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[280px] p-3" align="start">
        <div className="space-y-3">
          {/* 年月選択 */}
          <div className="flex items-center justify-between">
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="h-6 w-6"
              onClick={handlePrevMonth}
            >
              <ChevronLeft className="h-3 w-3" />
            </Button>
            <div className="text-xs font-semibold">
              {viewYear}年 {monthNames[viewMonth]}
            </div>
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="h-6 w-6"
              onClick={handleNextMonth}
            >
              <ChevronRight className="h-3 w-3" />
            </Button>
          </div>

          {/* 曜日ヘッダー */}
          <div className="grid grid-cols-7 gap-1">
            {['日', '月', '火', '水', '木', '金', '土'].map((day, index) => (
              <div
                key={day}
                className={`text-center text-xs font-medium py-1 ${
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
              const year = viewYear
              const month = viewMonth + 1
              const dayStr = String(day).padStart(2, '0')
              const monthStr = String(month).padStart(2, '0')
              const dateStr = `${year}-${monthStr}-${dayStr}`
              const selected = isSelected(day)

              return (
                <Button
                  key={day}
                  type="button"
                  variant="ghost"
                  className={`aspect-square p-0 text-xs h-7 w-7 ${
                    selected
                      ? 'bg-primary text-primary-foreground font-semibold hover:bg-primary/90'
                      : ''
                  }`}
                  onClick={() => handleDateClick(dateStr)}
                >
                  {day}
                </Button>
              )
            })}
          </div>

          {/* プレビュー */}
          {tempDate && (
            <div className="border bg-muted/30 px-2 py-1.5 text-xs text-center">
              {new Date(tempDate + 'T00:00:00').toLocaleDateString('ja-JP', {
                year: 'numeric',
                month: 'long',
                day: 'numeric',
                weekday: 'short'
              })}
            </div>
          )}

          {/* ボタン */}
          <div className="flex gap-2 pt-2 border-t">
            <Button
              type="button"
              variant="ghost"
              onClick={handleClear}
              size="sm"
              className="flex-1 h-7 text-xs"
            >
              クリア
            </Button>
            <Button
              type="button"
              onClick={handleSave}
              size="sm"
              className="flex-1 h-7 text-xs"
            >
              保存
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}


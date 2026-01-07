import React, { useState } from 'react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Button } from '@/components/ui/button'
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight } from 'lucide-react'

interface DateRangePopoverProps {
  startDate?: string  // YYYY-MM-DD 形式
  endDate?: string
  onDateChange: (startDate?: string, endDate?: string) => void
  label?: string
  buttonClassName?: string
}

export function DateRangePopover({
  startDate,
  endDate,
  onDateChange,
  label = '期間',
  buttonClassName = ''
}: DateRangePopoverProps) {
  const [open, setOpen] = useState(false)
  const [tempStartDate, setTempStartDate] = useState(startDate || '')
  const [tempEndDate, setTempEndDate] = useState(endDate || '')
  const [selectingStart, setSelectingStart] = useState(true) // true: 開始日選択中, false: 終了日選択中
  const [showMonthPicker, setShowMonthPicker] = useState(false) // 月選択モード

  // Popoverが開かれたときに現在の値をリセット
  React.useEffect(() => {
    if (open) {
      setTempStartDate(startDate || '')
      setTempEndDate(endDate || '')
      setSelectingStart(true) // 常に開始日から
      setShowMonthPicker(false) // 月選択モードをリセット
    }
  }, [open, startDate, endDate])

  const handleSave = () => {
    onDateChange(tempStartDate || undefined, tempEndDate || undefined)
    setOpen(false)
  }

  const handleClear = () => {
    setTempStartDate('')
    setTempEndDate('')
    onDateChange(undefined, undefined)
    setOpen(false)
  }

  const handleDateClick = (date: string) => {
    if (selectingStart) {
      setTempStartDate(date)
      setSelectingStart(false) // 次は終了日を選択
    } else {
      // 終了日が開始日より前の場合は入れ替え
      if (tempStartDate && date < tempStartDate) {
        setTempEndDate(tempStartDate)
        setTempStartDate(date)
      } else {
        setTempEndDate(date)
      }
    }
  }

  // ボタンには常にラベルのみ表示
  const displayValue = label

  // カレンダーUI
  const currentDate = tempStartDate ? new Date(tempStartDate) : new Date()
  const [viewYear, setViewYear] = useState(currentDate.getFullYear())
  const [viewMonth, setViewMonth] = useState(currentDate.getMonth())

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

  const handlePrevYear = () => {
    setViewYear(viewYear - 1)
  }

  const handleNextYear = () => {
    setViewYear(viewYear + 1)
  }

  const handleMonthSelect = (month: number) => {
    setViewMonth(month)
    setShowMonthPicker(false)
  }

  const daysInMonth = getDaysInMonth(viewYear, viewMonth)
  const firstDay = getFirstDayOfMonth(viewYear, viewMonth)
  const days = Array.from({ length: daysInMonth }, (_, i) => i + 1)
  const blanks = Array.from({ length: firstDay }, (_, i) => i)

  const isSelectedStart = (day: number) => {
    if (!tempStartDate) return false
    const date = new Date(tempStartDate)
    return (
      date.getFullYear() === viewYear &&
      date.getMonth() === viewMonth &&
      date.getDate() === day
    )
  }

  const isSelectedEnd = (day: number) => {
    if (!tempEndDate) return false
    const date = new Date(tempEndDate)
    return (
      date.getFullYear() === viewYear &&
      date.getMonth() === viewMonth &&
      date.getDate() === day
    )
  }

  const isInRange = (day: number) => {
    if (!tempStartDate || !tempEndDate) return false
    const year = viewYear
    const month = viewMonth + 1
    const dayStr = String(day).padStart(2, '0')
    const monthStr = String(month).padStart(2, '0')
    const currentDate = `${year}-${monthStr}-${dayStr}`
    return currentDate > tempStartDate && currentDate < tempEndDate
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
          size="sm"
          className={`text-xs h-10 px-2 w-full justify-start ${buttonClassName}`}
        >
          <CalendarIcon className="h-3 w-3 mr-1" />
          {displayValue}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[280px] p-3" align="start">
        <div className="space-y-3">
          {/* ステータス表示 */}
          <div className="text-xs text-center">
            {selectingStart ? (
              <span className="text-blue-600 font-medium">開始日を選択</span>
            ) : (
              <span className="text-green-600 font-medium">終了日を選択（またはスキップ）</span>
            )}
          </div>

          {/* 年月選択 */}
          <div className="flex items-center justify-between">
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="h-6 w-6"
              onClick={showMonthPicker ? handlePrevYear : handlePrevMonth}
            >
              <ChevronLeft className="h-3 w-3" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-xs font-semibold h-6 px-2 hover:bg-muted"
              onClick={() => setShowMonthPicker(!showMonthPicker)}
            >
              {showMonthPicker ? `${viewYear}年` : `${viewYear}年 ${monthNames[viewMonth]}`}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="h-6 w-6"
              onClick={showMonthPicker ? handleNextYear : handleNextMonth}
            >
              <ChevronRight className="h-3 w-3" />
            </Button>
          </div>

          {showMonthPicker ? (
            /* 月選択グリッド */
            <div className="grid grid-cols-3 gap-2">
              {monthNames.map((name, index) => (
                <Button
                  key={index}
                  type="button"
                  variant={viewMonth === index ? 'default' : 'ghost'}
                  size="sm"
                  className="h-8 text-xs"
                  onClick={() => handleMonthSelect(index)}
                >
                  {name}
                </Button>
              ))}
            </div>
          ) : (
            <>
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
                  const isStart = isSelectedStart(day)
                  const isEnd = isSelectedEnd(day)
                  const inRange = isInRange(day)

                  return (
                    <Button
                      key={day}
                      type="button"
                      variant="ghost"
                      className={`aspect-square p-0 text-xs h-7 w-7 ${
                        isStart || isEnd
                          ? 'bg-primary text-primary-foreground font-semibold hover:bg-primary/90'
                          : inRange
                          ? 'bg-primary/20 hover:bg-primary/30'
                          : ''
                      }`}
                      onClick={() => handleDateClick(dateStr)}
                    >
                      {day}
                    </Button>
                  )
                })}
              </div>
            </>
          )}

          {/* プレビュー */}
          {(tempStartDate || tempEndDate) && (
            <div className="border bg-muted/30 px-2 py-1.5 text-xs text-center">
              {tempStartDate && !tempEndDate && `${tempStartDate}から`}
              {!tempStartDate && tempEndDate && `${tempEndDate}まで`}
              {tempStartDate && tempEndDate && `${tempStartDate} 〜 ${tempEndDate}`}
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


import React, { useState } from 'react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Button } from '@/components/ui/button'
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight } from 'lucide-react'
import { CustomDatePicker } from '@/components/modals/CustomDatePicker'

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

  // Popoverが開かれたときに現在の値をリセット
  React.useEffect(() => {
    if (open) {
      setTempStartDate(startDate || '')
      setTempEndDate(endDate || '')
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

  // 表示用の文字列
  const displayValue = (() => {
    if (startDate && endDate) {
      return `${startDate} 〜 ${endDate}`
    }
    if (startDate && !endDate) {
      return `${startDate}から`
    }
    if (!startDate && endDate) {
      return `${endDate}まで`
    }
    return label
  })()

  // ステータス判定
  const getStatus = (): 'active' | 'ready' | 'legacy' | 'none' => {
    if (!startDate && !endDate) return 'none'
    const now = new Date()
    now.setHours(0, 0, 0, 0)
    const start = startDate ? new Date(startDate) : null
    const end = endDate ? new Date(endDate) : null
    if (start && now < start) return 'ready'
    if (end && now > end) return 'legacy'
    return 'active'
  }

  const status = getStatus()

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className={`text-xs h-10 px-3 w-full justify-start ${buttonClassName}`}
        >
          <CalendarIcon className="h-3 w-3 mr-2" />
          {displayValue}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[400px]" align="start">
        <div className="space-y-6">
          {/* 開始日カレンダー */}
          <CustomDatePicker
            value={tempStartDate}
            onChange={setTempStartDate}
            label="開始日（任意）"
          />
          <p className="text-xs text-muted-foreground -mt-2">
            未指定の場合、現行設定として扱われます
          </p>

          <div className="border-t pt-6">
            {/* 終了日カレンダー */}
            <CustomDatePicker
              value={tempEndDate}
              onChange={setTempEndDate}
              label="終了日（任意）"
            />
            <p className="text-xs text-muted-foreground mt-2">
              未指定の場合、無期限となります
            </p>
          </div>

          {/* プレビュー */}
          {(tempStartDate || tempEndDate) && (
            <div className="rounded-lg border bg-muted/50 p-4">
              <div className="flex items-center gap-2">
                <CalendarIcon className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium text-foreground">適用期間: </span>
                <span className="text-sm text-foreground">
                  {tempStartDate && !tempEndDate && `${tempStartDate}から`}
                  {!tempStartDate && tempEndDate && `${tempEndDate}まで`}
                  {tempStartDate && tempEndDate && `${tempStartDate} 〜 ${tempEndDate}`}
                </span>
              </div>
            </div>
          )}

          {/* ボタン */}
          <div className="flex gap-3 pt-4 border-t">
            <Button
              type="button"
              variant="ghost"
              onClick={handleClear}
              className="flex-1"
            >
              クリア
            </Button>
            <Button
              type="button"
              onClick={handleSave}
              className="flex-1"
            >
              保存
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}


import React, { useState } from 'react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Button } from '@/components/ui/button'
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight } from 'lucide-react'
import { format } from 'date-fns'
import { ja } from 'date-fns/locale'

interface MonthPickerPopoverProps {
  value?: string  // YYYY-MM-DD 形式
  onSelect: (date?: string) => void
  label?: string
  buttonClassName?: string
}

export function MonthPickerPopover({
  value,
  onSelect,
  label = '発生月',
  buttonClassName = ''
}: MonthPickerPopoverProps) {
  const [open, setOpen] = useState(false)
  const currentDate = value ? new Date(value) : new Date()
  const [viewYear, setViewYear] = useState(currentDate.getFullYear())

  const handleMonthSelect = (month: number) => {
    const selectedDate = new Date(viewYear, month, 1)
    const formattedDate = format(selectedDate, 'yyyy-MM-dd')
    onSelect(formattedDate)
    setOpen(false)
  }

  const handleClear = () => {
    onSelect(undefined)
    setOpen(false)
  }

  // YYYY-MM-DD から YYYY年MM月 に変換
  const displayValue = value 
    ? format(new Date(value), 'yyyy年M月', { locale: ja })
    : label

  const months = [
    '1月', '2月', '3月', '4月', '5月', '6月',
    '7月', '8月', '9月', '10月', '11月', '12月'
  ]

  const selectedMonth = value ? new Date(value).getMonth() : -1

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
      <PopoverContent className="w-80" align="start">
        <div className="space-y-4">
          {/* 年選択 */}
          <div className="flex items-center justify-between">
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="h-7 w-7"
              onClick={() => setViewYear(viewYear - 1)}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <div className="text-sm font-semibold">
              {viewYear}年
            </div>
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="h-7 w-7"
              onClick={() => setViewYear(viewYear + 1)}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>

          {/* 月選択グリッド */}
          <div className="grid grid-cols-3 gap-2">
            {months.map((month, index) => {
              const isSelected = viewYear === new Date(value || '').getFullYear() && selectedMonth === index
              return (
                <Button
                  key={index}
                  type="button"
                  variant={isSelected ? "default" : "outline"}
                  className={`h-10 text-sm ${isSelected ? 'bg-primary text-primary-foreground' : ''}`}
                  onClick={() => handleMonthSelect(index)}
                >
                  {month}
                </Button>
              )
            })}
          </div>

          {/* クリアボタン */}
          {value && (
            <Button
              type="button"
              variant="outline"
              onClick={handleClear}
              className="w-full"
            >
              クリア
            </Button>
          )}

          <p className="text-xs text-muted-foreground text-center">
            未指定の場合は常時計上として扱われます
          </p>
        </div>
      </PopoverContent>
    </Popover>
  )
}


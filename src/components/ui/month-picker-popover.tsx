import React, { useState } from 'react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Calendar } from 'lucide-react'

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
  const [tempValue, setTempValue] = useState(value ? value.substring(0, 7) : '')

  const handleSave = () => {
    onSelect(tempValue ? `${tempValue}-01` : undefined)
    setOpen(false)
  }

  const handleClear = () => {
    setTempValue('')
    onSelect(undefined)
    setOpen(false)
  }

  // YYYY-MM-DD から YYYY年MM月 に変換
  const displayValue = value 
    ? (() => {
        const [year, month] = value.substring(0, 7).split('-')
        return `${year}年${parseInt(month)}月`
      })()
    : label

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className={`text-xs h-10 px-3 w-full justify-start ${buttonClassName}`}
        >
          <Calendar className="h-3 w-3 mr-2" />
          {displayValue}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80" align="start">
        <div className="space-y-4">
          <div>
            <Label htmlFor="month-picker" className="text-sm font-medium">
              発生月を選択
            </Label>
            <Input
              id="month-picker"
              type="month"
              value={tempValue}
              onChange={(e) => setTempValue(e.target.value)}
              className="mt-2"
            />
            <p className="text-xs text-muted-foreground mt-2">
              未指定の場合は常時計上として扱われます
            </p>
          </div>

          {tempValue && (
            <div className="p-3 bg-muted rounded-md text-sm">
              <span className="font-medium">発生月: </span>
              {tempValue}
            </div>
          )}

          <div className="flex gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
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


import type { ReactNode } from 'react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { MonthGrid } from './MonthGrid'

interface DatePickerPopoverProps {
  value: string | null
  today: string
  maxDate: string
  markedDates?: ReadonlySet<string>
  open: boolean
  onOpenChange: (open: boolean) => void
  onSelect: (date: string) => void
  children: ReactNode
}

/** 「日付を選ぶ」チップから開く月カレンダー */
export function DatePickerPopover({ value, today, maxDate, markedDates, open, onOpenChange, onSelect, children }: DatePickerPopoverProps) {
  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent align="start" className="w-[296px] rounded-lg p-3">
        <MonthGrid value={value} today={today} maxDate={maxDate} markedDates={markedDates} onSelect={onSelect} />
      </PopoverContent>
    </Popover>
  )
}

import { useState } from 'react'
import { ChevronDown, ChevronLeft, ChevronRight, EyeOff } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { ChipButton } from '@/components/public-top/ChipButton'
import { StorePicker, type StoreOption } from '@/components/public-top/StorePicker'
import { cn } from '@/lib/utils'

interface BookingFiltersProps {
  currentMonth: Date
  onMonthChange: (date: Date) => void
  selectedStoreIds: string[]
  onStoreIdsChange: (storeIds: string[]) => void
  /** お客様向けの店舗名にした選択肢 */
  storeOptions: StoreOption[]
  hideSoldOut?: boolean
  onHideSoldOutChange?: (value: boolean) => void
  /** 選べる月の数（今月から） */
  monthCount?: number
  primaryColor: string
}

function monthStart(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1) // jst-ignore（カレンダーの月の計算。日付の表示には使わない）
}

/**
 * 予約サイトのカレンダー・リスト共通の操作（年月・店舗・満席を非表示）。
 * 元の操作のまま、見た目は新しいトップのチップに合わせた（2026-10-12 社長決定）。
 */
export function BookingFilters({
  currentMonth,
  onMonthChange,
  selectedStoreIds,
  onStoreIdsChange,
  storeOptions,
  hideSoldOut = false,
  onHideSoldOutChange,
  monthCount = 3,
  primaryColor,
}: BookingFiltersProps) {
  const [monthOpen, setMonthOpen] = useState(false)
  const thisMonth = monthStart(new Date())
  const current = monthStart(currentMonth)
  const months = Array.from({ length: monthCount }, (_, i) => new Date(thisMonth.getFullYear(), thisMonth.getMonth() + i, 1))
  const isFirst = current.getTime() <= thisMonth.getTime()
  const isLast = current.getTime() >= months[months.length - 1].getTime()
  const label = `${current.getFullYear()}年${current.getMonth() + 1}月`
  const navButton = 'inline-flex h-8 w-8 items-center justify-center rounded-full border border-input bg-white hover:bg-muted disabled:opacity-30'

  return (
    <div className="mb-3 flex flex-wrap items-center gap-1.5">
      <div className="flex items-center gap-1">
        <button type="button" aria-label="前の月" disabled={isFirst} className={navButton} onClick={() => onMonthChange(new Date(current.getFullYear(), current.getMonth() - 1, 1))}>
          <ChevronLeft className="h-4 w-4" />
        </button>
        <Popover open={monthOpen} onOpenChange={setMonthOpen}>
          <PopoverTrigger asChild>
            <ChipButton className="font-bold">
              {label}
              <ChevronDown className="h-3.5 w-3.5 opacity-60" aria-hidden />
            </ChipButton>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-44 rounded-lg p-1.5">
            {months.map((m) => (
              <button
                key={m.getTime()}
                type="button"
                onClick={() => { onMonthChange(m); setMonthOpen(false) }}
                className={cn('block w-full rounded-md px-2.5 py-2 text-left text-sm hover:bg-muted', m.getTime() === current.getTime() && 'font-bold')}
              >
                {m.getFullYear()}年{m.getMonth() + 1}月
              </button>
            ))}
          </PopoverContent>
        </Popover>
        <button type="button" aria-label="次の月" disabled={isLast} className={navButton} onClick={() => onMonthChange(new Date(current.getFullYear(), current.getMonth() + 1, 1))}>
          <ChevronRight className="h-4 w-4" />
        </button>
        {!isFirst && (
          <ChipButton onClick={() => onMonthChange(thisMonth)}>今月</ChipButton>
        )}
      </div>
      {storeOptions.length > 1 && (
        <StorePicker options={storeOptions} value={selectedStoreIds} onChange={onStoreIdsChange} primaryColor={primaryColor} />
      )}
      {onHideSoldOutChange && (
        <ChipButton selected={hideSoldOut} primaryColor={primaryColor} onClick={() => onHideSoldOutChange(!hideSoldOut)}>
          <EyeOff className="h-3.5 w-3.5" aria-hidden />満席を非表示
        </ChipButton>
      )}
    </div>
  )
}

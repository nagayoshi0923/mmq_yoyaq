import { useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { getJstWeekdayIndex, jstMonthDateRange } from '@/utils/jstDate'
import { cn } from '@/lib/utils'

const WEEK = ['日', '月', '火', '水', '木', '金', '土']

function shiftMonth(ym: string, delta: number): string {
  const [y, m] = ym.split('-').map(Number)
  const total = y * 12 + (m - 1) + delta
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, '0')}`
}

interface MonthGridProps {
  value: string | null
  today: string
  maxDate: string
  /** 空きのある日（緑の点） */
  markedDates?: ReadonlySet<string>
  onSelect: (date: string) => void
}

/** 月カレンダー（旧カレンダー表示の置き換え。日付は JST の YYYY-MM-DD のまま扱う） */
export function MonthGrid({ value, today, maxDate, markedDates, onSelect }: MonthGridProps) {
  const [ym, setYm] = useState(() => (value ?? today).slice(0, 7))
  const minYm = today.slice(0, 7)
  const maxYm = maxDate.slice(0, 7)

  const cells = useMemo(() => {
    const [y, m] = ym.split('-').map(Number)
    const lastDay = Number(jstMonthDateRange(y, m).end.slice(8, 10))
    const lead = getJstWeekdayIndex(`${ym}-01`) ?? 0
    const list: (string | null)[] = Array.from({ length: lead }, () => null)
    for (let d = 1; d <= lastDay; d++) list.push(`${ym}-${String(d).padStart(2, '0')}`)
    return list
  }, [ym])

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <button type="button" aria-label="前の月" disabled={ym <= minYm} onClick={() => setYm(shiftMonth(ym, -1))} className="rounded-md p-1 disabled:opacity-30">
          <ChevronLeft className="h-4 w-4" />
        </button>
        <span className="text-sm font-bold">{Number(ym.slice(0, 4))}年{Number(ym.slice(5, 7))}月</span>
        <button type="button" aria-label="次の月" disabled={ym >= maxYm} onClick={() => setYm(shiftMonth(ym, 1))} className="rounded-md p-1 disabled:opacity-30">
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
      <div className="grid grid-cols-7 gap-0.5 text-center text-xs text-muted-foreground">
        {WEEK.map((w) => <div key={w} className="py-1">{w}</div>)}
      </div>
      <div className="grid grid-cols-7 gap-0.5 text-center">
        {cells.map((date, i) => {
          if (!date) return <div key={`blank-${i}`} />
          const disabled = date < today || date > maxDate
          const selected = date === value
          const marked = !disabled && markedDates?.has(date)
          return (
            <button
              key={date}
              type="button"
              disabled={disabled}
              onClick={() => onSelect(date)}
              className={cn(
                'relative flex h-9 flex-col items-center justify-center rounded-md text-sm',
                disabled ? 'text-muted-foreground/40' : 'hover:bg-muted',
                selected && 'bg-foreground text-background hover:bg-foreground',
                marked && !selected && 'font-bold',
              )}
            >
              {Number(date.slice(8, 10))}
              {marked && <span className={cn('absolute bottom-1 h-1 w-1 rounded-full', selected ? 'bg-background' : 'bg-emerald-600')} />}
            </button>
          )
        })}
      </div>
      {markedDates && (
        <p className="mt-2 text-xs text-muted-foreground"><span className="mr-1 inline-block h-1.5 w-1.5 rounded-full bg-emerald-600 align-middle" />空席のある公演がある日</p>
      )}
    </div>
  )
}

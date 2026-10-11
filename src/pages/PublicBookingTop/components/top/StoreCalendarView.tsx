import { useEffect, useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { KeyVisualThumb } from '@/components/public-top/KeyVisualThumb'
import type { StoreOption } from '@/components/public-top/StorePicker'
import type { PublicPerformance } from '@/lib/publicPerformanceSearch'
import { buildTimetableDay, type PrivateBlock } from '@/lib/publicTimetable'
import { formatJstMonthDay, getJstWeekdayIndex, jstMonthDateRange } from '@/utils/jstDate'
import { cn } from '@/lib/utils'
import { TimetableDayTable } from './TimetableDayTable'

const WEEK = ['日', '月', '火', '水', '木', '金', '土']
/** マスに出す作品画像の数 */
const THUMBS_PER_DAY = 2

function shiftMonth(ym: string, delta: number): string {
  const [y, m] = ym.split('-').map(Number)
  const total = y * 12 + (m - 1) + delta
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, '0')}`
}

interface DayCell {
  count: number
  open: number
  thumbs: PublicPerformance[]
}

interface StoreCalendarViewProps {
  /** 店舗・初心者向け・人数で絞った公演（満席を含む） */
  performances: PublicPerformance[]
  privateBlocks: PrivateBlock[]
  stores: StoreOption[]
  people: number
  selectedDate: string
  today: string
  maxDate: string
  primaryColor: string
  onSelectDate: (date: string) => void
  onSelect: (p: PublicPerformance) => void
}

/**
 * 店舗トップのカレンダー（刷新）。マスは「日付」「作品の小さな画像 2 枚まで」「+N 空き／満席」だけで、
 * 作品名の文字は書かない（点検 16）。日を押すと、その日の時間割（リストと同じ形）をマス目の下に出す。
 */
export function StoreCalendarView({ performances, privateBlocks, stores, people, selectedDate, today, maxDate, primaryColor, onSelectDate, onSelect }: StoreCalendarViewProps) {
  const selected = selectedDate >= today ? selectedDate : today
  const [ym, setYm] = useState(selected.slice(0, 7))
  useEffect(() => { setYm(selected.slice(0, 7)) }, [selected])
  const minYm = today.slice(0, 7)
  const maxYm = maxDate.slice(0, 7)

  const byDay = useMemo(() => {
    const map = new Map<string, DayCell>()
    const sorted = [...performances].sort((a, b) => a.start_time.localeCompare(b.start_time))
    for (const p of sorted) {
      const cell = map.get(p.date) ?? { count: 0, open: 0, thumbs: [] }
      cell.count += 1
      const isOpen = p.available_seats >= people
      if (isOpen) cell.open += 1
      // 画像は空きのある公演を優先し、同じ作品は 1 枚だけ
      if (!cell.thumbs.some((t) => t.scenario_id === p.scenario_id)) {
        if (isOpen) cell.thumbs = [p, ...cell.thumbs.filter((t) => t.available_seats >= people), ...cell.thumbs.filter((t) => t.available_seats < people)]
        else cell.thumbs.push(p)
      }
      map.set(p.date, cell)
    }
    return map
  }, [performances, people])

  const cells = useMemo(() => {
    const [y, m] = ym.split('-').map(Number)
    const { start, end } = jstMonthDateRange(y, m)
    const lead = getJstWeekdayIndex(start) ?? 0
    const list: (string | null)[] = Array.from({ length: lead }, () => null)
    for (let d = 1; d <= Number(end.slice(8, 10)); d++) list.push(`${ym}-${String(d).padStart(2, '0')}`)
    return list
  }, [ym])

  const day = useMemo(() => buildTimetableDay(selected, performances, privateBlocks, stores, people), [selected, performances, privateBlocks, stores, people])

  return (
    <div className="mt-2">
      <div className="mb-1 flex items-center justify-between gap-2">
        <button type="button" aria-label="前の月" disabled={ym <= minYm} onClick={() => setYm(shiftMonth(ym, -1))} className="rounded-md p-2 disabled:opacity-30">
          <ChevronLeft className="h-5 w-5" />
        </button>
        <span className="text-base font-bold">{Number(ym.slice(0, 4))}年{Number(ym.slice(5, 7))}月</span>
        <div className="flex items-center">
          <button type="button" onClick={() => { setYm(today.slice(0, 7)); onSelectDate(today) }} className="rounded-md border border-input px-2 py-1 text-xs hover:bg-muted">
            今日
          </button>
          <button type="button" aria-label="次の月" disabled={ym >= maxYm} onClick={() => setYm(shiftMonth(ym, 1))} className="rounded-md p-2 disabled:opacity-30">
            <ChevronRight className="h-5 w-5" />
          </button>
        </div>
      </div>
      <div className="grid grid-cols-7 gap-0.5 text-center text-xs text-muted-foreground">
        {WEEK.map((w, i) => <div key={w} className={cn('py-1', i === 0 && 'text-red-600', i === 6 && 'text-blue-600')}>{w}</div>)}
      </div>
      <div className="grid grid-cols-7 gap-0.5">
        {cells.map((date, i) => {
          if (!date) return <div key={`blank-${i}`} />
          const disabled = date < today || date > maxDate
          const cell = disabled ? undefined : byDay.get(date)
          const isSelected = date === selected
          const w = getJstWeekdayIndex(date)
          return (
            <button
              key={date}
              type="button"
              disabled={disabled}
              aria-pressed={isSelected}
              aria-label={`${formatJstMonthDay(date, true)} ${cell ? `公演 ${cell.count} 件（空きあり ${cell.open} 件）` : '公演なし'}`}
              onClick={() => onSelectDate(date)}
              className={cn(
                'flex min-w-0 flex-col items-start gap-0.5 rounded-md border bg-white p-0.5 text-left',
                disabled ? 'border-transparent bg-transparent' : 'min-h-[58px] border-border hover:bg-muted/40',
                isSelected && 'border-2',
              )}
              style={isSelected ? { borderColor: primaryColor, backgroundColor: '#fff5f5' } : undefined}
            >
              <span className={cn(
                'text-xs leading-none',
                disabled ? 'text-muted-foreground/40' : w === 0 ? 'text-red-600' : w === 6 ? 'text-blue-600' : '',
                (isSelected || date === today) && 'font-bold',
              )}>
                {Number(date.slice(8, 10))}
              </span>
              {cell && (
                <>
                  <span className="flex gap-px" aria-hidden>
                    {cell.thumbs.slice(0, THUMBS_PER_DAY).map((p) => (
                      <KeyVisualThumb key={p.id} src={p.key_visual_url} alt="" seed={p.scenario_id} width={40} className="aspect-[3/4] w-3.5 rounded-sm" />
                    ))}
                  </span>
                  <span className={cn('ts-micro whitespace-nowrap', cell.open > 0 ? 'text-emerald-700' : 'text-muted-foreground')}>
                    {cell.open > 0 ? `+${cell.open} 空き` : '満席'}
                  </span>
                </>
              )}
            </button>
          )
        })}
      </div>
      <p className="mt-1 text-xs text-muted-foreground">マスの数字は人数分の空席がある公演の数です。日を押すとその日の時間割が出ます。</p>
      <div className="mt-3 border-t border-border pt-1">
        <TimetableDayTable day={day} onSelect={onSelect} />
        {day.total === 0 && <p className="py-3 text-center text-sm text-muted-foreground">この日は条件に合う公演がありません。</p>}
      </div>
    </div>
  )
}

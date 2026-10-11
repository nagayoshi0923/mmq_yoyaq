import { useEffect, useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { PerformanceResultList } from '@/components/public-top/PerformanceResultList'
import {
  calendarDaySummaries,
  searchPerformances,
  type PublicPerformance,
} from '@/lib/publicPerformanceSearch'
import { formatJstMonthDay, getJstWeekdayIndex, jstMonthDateRange } from '@/utils/jstDate'
import { cn } from '@/lib/utils'

const WEEK = ['日', '月', '火', '水', '木', '金', '土']
/** マスに描く点の上限（それ以上は「+」） */
const MAX_DOTS = 4

function shiftMonth(ym: string, delta: number): string {
  const [y, m] = ym.split('-').map(Number)
  const total = y * 12 + (m - 1) + delta
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, '0')}`
}

interface StoreCalendarViewProps {
  performances: PublicPerformance[]
  isLoading: boolean
  people: number
  onlyAvailable: boolean
  beginnerOnly: boolean
  storeIds: string[]
  selectedDate: string | null
  today: string
  maxDate: string
  nowMs: number
  primaryColor: string
  onSelectDate: (date: string) => void
  onSelect: (p: PublicPerformance) => void
}

/**
 * 店舗トップのカレンダー表示（旧カレンダーの置き換え、点検 16）。
 * マスは日付と公演数の点だけ（作品名は書かない）。空きのある日は緑、満席のみは灰色、選んだ日は赤。
 * 日を押すと、その日の公演を一覧と同じカードでマス目の下に出す。人数・店舗・空席・初心者向けの絞り込みが効く。
 */
export function StoreCalendarView({
  performances, isLoading, people, onlyAvailable, beginnerOnly, storeIds, selectedDate, today, maxDate, nowMs, primaryColor, onSelectDate, onSelect,
}: StoreCalendarViewProps) {
  const selected = selectedDate && selectedDate >= today ? selectedDate : today
  const [ym, setYm] = useState(selected.slice(0, 7))
  useEffect(() => { setYm(selected.slice(0, 7)) }, [selected])
  const minYm = today.slice(0, 7)
  const maxYm = maxDate.slice(0, 7)

  const monthRange = useMemo(() => {
    const [y, m] = ym.split('-').map(Number)
    return jstMonthDateRange(y, m)
  }, [ym])
  const summaries = useMemo(
    () => calendarDaySummaries(performances, { range: { from: monthRange.start, to: monthRange.end }, people, beginnerOnly, storeIds }, nowMs),
    [performances, monthRange, people, beginnerOnly, storeIds, nowMs],
  )
  const cells = useMemo(() => {
    const lastDay = Number(monthRange.end.slice(8, 10))
    const lead = getJstWeekdayIndex(monthRange.start) ?? 0
    const list: (string | null)[] = Array.from({ length: lead }, () => null)
    for (let d = 1; d <= lastDay; d++) list.push(`${ym}-${String(d).padStart(2, '0')}`)
    return list
  }, [ym, monthRange])

  const dayResults = useMemo(() => searchPerformances(performances, {
    range: { from: selected, to: selected }, people, onlyAvailable, beginnerOnly, storeIds,
  }, nowMs), [performances, selected, people, onlyAvailable, beginnerOnly, storeIds, nowMs])
  const daySummary = summaries.get(selected)

  return (
    <div className="mt-2">
      <div className="mb-1 flex items-center justify-between gap-2">
        <button type="button" aria-label="前の月" disabled={ym <= minYm} onClick={() => setYm(shiftMonth(ym, -1))} className="rounded-md p-2 disabled:opacity-30">
          <ChevronLeft className="h-5 w-5" />
        </button>
        <span className="text-base font-bold">{Number(ym.slice(0, 4))}年{Number(ym.slice(5, 7))}月</span>
        <div className="flex items-center">
          <button
            type="button"
            onClick={() => { setYm(today.slice(0, 7)); onSelectDate(today) }}
            className="rounded-md border border-input px-2 py-1 text-xs hover:bg-muted"
          >
            今日
          </button>
          <button type="button" aria-label="次の月" disabled={ym >= maxYm} onClick={() => setYm(shiftMonth(ym, 1))} className="rounded-md p-2 disabled:opacity-30">
            <ChevronRight className="h-5 w-5" />
          </button>
        </div>
      </div>
      <div className="grid grid-cols-7 text-center text-xs text-muted-foreground">
        {WEEK.map((w, i) => <div key={w} className={cn('py-1', i === 0 && 'text-red-600', i === 6 && 'text-blue-600')}>{w}</div>)}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {cells.map((date, i) => {
          if (!date) return <div key={`blank-${i}`} />
          const disabled = date < today || date > maxDate
          const summary = disabled ? undefined : summaries.get(date)
          const isSelected = date === selected
          const hasOpen = !!summary && summary.open > 0
          const dots = Math.min(summary?.count ?? 0, MAX_DOTS)
          return (
            <button
              key={date}
              type="button"
              disabled={disabled}
              aria-pressed={isSelected}
              aria-label={`${formatJstMonthDay(date, true)} ${summary ? `公演 ${summary.count} 件（空きあり ${summary.open} 件）` : '公演なし'}`}
              onClick={() => onSelectDate(date)}
              className={cn(
                'flex h-12 flex-col items-center justify-center gap-1 rounded-md border text-sm',
                disabled && 'border-transparent text-muted-foreground/40',
                !disabled && !isSelected && (hasOpen ? 'border-emerald-200 bg-emerald-50' : summary ? 'border-border bg-muted/60' : 'border-transparent'),
                isSelected && 'border-2 font-bold',
              )}
              style={isSelected ? { borderColor: primaryColor, color: primaryColor } : undefined}
            >
              <span className={cn(date === today && !isSelected && 'font-bold underline')}>{Number(date.slice(8, 10))}</span>
              <span className="flex h-1.5 items-center gap-0.5" aria-hidden>
                {Array.from({ length: dots }).map((_, k) => (
                  <span key={k} className={cn('h-1.5 w-1.5 rounded-full', hasOpen ? 'bg-emerald-600' : 'bg-muted-foreground/50')} />
                ))}
                {(summary?.count ?? 0) > MAX_DOTS && <span className="text-xs leading-none text-muted-foreground">+</span>}
              </span>
            </button>
          )
        })}
      </div>
      <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
        <span><span className="mr-1 inline-block h-1.5 w-1.5 rounded-full bg-emerald-600 align-middle" />空きあり</span>
        <span><span className="mr-1 inline-block h-1.5 w-1.5 rounded-full bg-muted-foreground/50 align-middle" />満席のみ</span>
        <span>点の数＝公演数</span>
      </div>

      <p className="mt-3 text-xs text-muted-foreground">
        {formatJstMonthDay(selected, true)} {onlyAvailable ? `に ${people} 名で入れる公演` : 'の公演'}{' '}
        <b className="text-sm text-foreground">{isLoading && dayResults.length === 0 ? '…' : `${dayResults.length} 件`}</b>
        {onlyAvailable && daySummary && daySummary.count > daySummary.open && (
          <span>（満席 {daySummary.count - daySummary.open} 件は「空席あり」を外すと出ます）</span>
        )}
      </p>
      <PerformanceResultList
        performances={dayResults}
        isLoading={isLoading}
        resetKey={`${selected}_${people}_${onlyAvailable}_${beginnerOnly}_${storeIds.join(',')}`}
        onSelect={onSelect}
        empty={<>この日は条件に合う公演がありません。緑の日を選んでみてください。</>}
      />
    </div>
  )
}

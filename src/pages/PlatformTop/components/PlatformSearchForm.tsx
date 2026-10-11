import { useState } from 'react'
import { CalendarDays, ChevronDown, MapPin } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { MonthGrid } from '@/components/public-top/MonthGrid'
import { PeoplePicker } from '@/components/public-top/PeoplePicker'
import type { PerformanceSearchState } from '@/components/public-top/usePerformanceSearchParams'
import { DATE_PRESETS, type DateRange } from '@/lib/publicPerformanceSearch'
import { formatJstMonthDay } from '@/utils/jstDate'
import { cn } from '@/lib/utils'

interface PlatformSearchFormProps {
  state: PerformanceSearchState
  range: DateRange
  prefectures: string[]
  today: string
  maxDate: string
  markedDates: ReadonlySet<string>
  primaryColor: string
  onChange: (patch: Partial<PerformanceSearchState>) => void
  onSubmit: () => void
}

const field = 'flex w-full items-center justify-between gap-1 rounded-md border border-input bg-white px-2.5 py-2 text-sm hover:bg-muted'

/** 全体トップの横断検索（エリア・日付・人数） */
export function PlatformSearchForm({ state, range, prefectures, today, maxDate, markedDates, primaryColor, onChange, onSubmit }: PlatformSearchFormProps) {
  const [areaOpen, setAreaOpen] = useState(false)
  const [dateOpen, setDateOpen] = useState(false)
  const [showMonth, setShowMonth] = useState(false)
  const dateLabel = state.preset === 'date'
    ? formatJstMonthDay(range.from, true)
    : DATE_PRESETS.find((d) => d.value === state.preset)?.label ?? '今週末'

  return (
    <div className="mt-3 flex flex-col gap-2 rounded-lg bg-white p-2.5 text-foreground">
      <div className="grid grid-cols-2 gap-2">
        <Popover open={areaOpen} onOpenChange={setAreaOpen}>
          <PopoverTrigger asChild>
            <button type="button" className={field}>
              <span className="inline-flex min-w-0 items-center gap-1"><MapPin className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden /><span className="truncate">{state.area ?? '全国'}</span></span>
              <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
            </button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-48 rounded-lg p-1.5">
            {[null, ...prefectures].map((p) => (
              <button
                key={p ?? 'all'}
                type="button"
                onClick={() => { onChange({ area: p }); setAreaOpen(false) }}
                className={cn('block w-full rounded-md px-2.5 py-2 text-left text-sm hover:bg-muted', (state.area ?? null) === p && 'font-bold')}
              >
                {p ?? '全国'}
              </button>
            ))}
          </PopoverContent>
        </Popover>
        <Popover open={dateOpen} onOpenChange={(o) => { setDateOpen(o); if (o) setShowMonth(state.preset === 'date') }}>
          <PopoverTrigger asChild>
            <button type="button" className={field}>
              <span className="inline-flex min-w-0 items-center gap-1"><CalendarDays className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden /><span className="truncate">{dateLabel}</span></span>
              <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
            </button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-[296px] rounded-lg p-2">
            <div className="grid grid-cols-5 gap-1">
              {DATE_PRESETS.map((d) => (
                <button
                  key={d.value}
                  type="button"
                  onClick={() => { onChange({ preset: d.value }); setDateOpen(false) }}
                  className={cn('rounded-md py-2 text-xs', state.preset === d.value ? 'bg-foreground font-bold text-background' : 'hover:bg-muted')}
                >
                  {d.label}
                </button>
              ))}
              <button
                type="button"
                onClick={() => setShowMonth(true)}
                className={cn('rounded-md py-2 text-xs', state.preset === 'date' || showMonth ? 'bg-foreground font-bold text-background' : 'hover:bg-muted')}
              >
                日付
              </button>
            </div>
            {showMonth && (
              <div className="mt-2 border-t pt-2">
                <MonthGrid
                  value={state.preset === 'date' ? range.from : null}
                  today={today}
                  maxDate={maxDate}
                  markedDates={markedDates}
                  onSelect={(date) => { onChange({ preset: 'date', date }); setDateOpen(false) }}
                />
              </div>
            )}
          </PopoverContent>
        </Popover>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <PeoplePicker block value={state.people} onChange={(people) => onChange({ people })} />
        <button
          type="button"
          onClick={onSubmit}
          className="rounded-md px-2 py-2 text-sm font-bold text-white hover:opacity-90"
          style={{ backgroundColor: primaryColor }}
        >
          空いている公演を探す
        </button>
      </div>
    </div>
  )
}

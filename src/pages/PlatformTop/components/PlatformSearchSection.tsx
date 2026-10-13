import { useMemo, useState } from 'react'
import { CalendarDays, Check, ChevronDown } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { ChipButton } from '@/components/public-top/ChipButton'
import { MonthGrid } from '@/components/public-top/MonthGrid'
import { PerformanceResultList } from '@/components/public-top/PerformanceResultList'
import { StorePicker } from '@/components/public-top/StorePicker'
import { TopSection } from '@/components/public-top/TopSection'
import type { PerformanceSearchState } from '@/components/public-top/usePerformanceSearchParams'
import type { ScenarioCardData, ScenarioCardSource } from '@/components/public-top/scenarioCards'
import type { ScenarioMarks } from '@/components/public-top/useScenarioMarks'
import { DATE_PRESETS, describeDateRange, type DateRange, type PublicPerformance } from '@/lib/publicPerformanceSearch'
import { formatJstMonthDay } from '@/utils/jstDate'
import { cn } from '@/lib/utils'
import { platformStoreOptions } from '../utils/platformStoreOptions'

interface PlatformSearchSectionProps {
  /** 全店舗の公演（店舗の選択肢を作る） */
  performances: PublicPerformance[]
  /** 条件で絞った結果（日付順） */
  results: PublicPerformance[]
  range: DateRange
  isLoading: boolean
  state: PerformanceSearchState
  onChange: (patch: Partial<PerformanceSearchState>) => void
  prefectures: string[]
  today: string
  maxDate: string
  /** 空きのある日（日付のカレンダーの点） */
  markedDates: ReadonlySet<string>
  primaryColor: string
  source: ScenarioCardSource
  marks?: ScenarioMarks | null
  onOpen: (card: ScenarioCardData) => void
}

/**
 * MMQ 全体トップ「空いている公演を探す」（見本 TopMMQ.dc.html の 3。2026-10-14 社長指摘で上の帯から独立した枠に）。
 * 1 行目: 今週／来週／今月／日付（横スクロール、折り返さない）。2 行目: エリア／店舗／空席あり／初心者向け（折り返し可）。
 * その下に「期間 に空きのある公演 N 件」と、作品カードを 2 列（PC 4 列）で全部（見本どおり下の注記は無し）。
 */
export function PlatformSearchSection({
  performances, results, range, isLoading, state, onChange, prefectures, today, maxDate, markedDates, primaryColor, source, marks, onOpen,
}: PlatformSearchSectionProps) {
  const [areaOpen, setAreaOpen] = useState(false)
  const [dateOpen, setDateOpen] = useState(false)
  const storeOptions = useMemo(() => platformStoreOptions(performances, state.area), [performances, state.area])
  const hasBeginner = useMemo(() => performances.some((p) => p.beginner_friendly), [performances])

  return (
    <TopSection id="results" title="空いている公演を探す">
      <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1 scroll-row" role="group" aria-label="日付">
        {DATE_PRESETS.map((d) => (
          <ChipButton key={d.value} selected={state.preset === d.value} primaryColor={primaryColor} onClick={() => onChange({ preset: d.value })}>
            {d.label}
          </ChipButton>
        ))}
        <Popover open={dateOpen} onOpenChange={setDateOpen}>
          <PopoverTrigger asChild>
            <ChipButton selected={state.preset === 'date'} primaryColor={primaryColor}>
              <CalendarDays className="h-4 w-4" aria-hidden />
              {state.preset === 'date' ? formatJstMonthDay(range.from, true) : '日付'}
            </ChipButton>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-[296px] rounded-lg p-2">
            <MonthGrid
              value={state.preset === 'date' ? range.from : null}
              today={today}
              maxDate={maxDate}
              markedDates={markedDates}
              onSelect={(date) => { onChange({ preset: 'date', date }); setDateOpen(false) }}
            />
          </PopoverContent>
        </Popover>
      </div>

      <div className="mt-2 flex flex-wrap gap-1.5">
        {prefectures.length > 0 && (
          <Popover open={areaOpen} onOpenChange={setAreaOpen}>
            <PopoverTrigger asChild>
              <ChipButton selected={!!state.area} primaryColor={primaryColor}>
                エリア{state.area ? ` ${state.area}` : ''}
                <ChevronDown className="h-3.5 w-3.5 opacity-60" aria-hidden />
              </ChipButton>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-48 rounded-lg p-1.5">
              {[null, ...prefectures].map((p) => (
                <button
                  key={p ?? 'all'}
                  type="button"
                  onClick={() => { onChange({ area: p, storeIds: [] }); setAreaOpen(false) }}
                  className={cn('block w-full rounded-md px-2.5 py-2 text-left text-sm hover:bg-muted', (state.area ?? null) === p && 'font-bold')}
                >
                  {p ?? '全国'}
                </button>
              ))}
            </PopoverContent>
          </Popover>
        )}
        {storeOptions.length > 1 && (
          <StorePicker options={storeOptions} value={state.storeIds} onChange={(storeIds) => onChange({ storeIds })} primaryColor={primaryColor} />
        )}
        <ChipButton selected={state.onlyAvailable} tone="green" onClick={() => onChange({ onlyAvailable: !state.onlyAvailable })}>
          {state.onlyAvailable && <Check className="h-3.5 w-3.5" aria-hidden />}空席あり
        </ChipButton>
        {hasBeginner && (
          <ChipButton selected={state.beginnerOnly} primaryColor={primaryColor} onClick={() => onChange({ beginnerOnly: !state.beginnerOnly })}>
            {state.beginnerOnly && <Check className="h-3.5 w-3.5" aria-hidden />}初心者向け
          </ChipButton>
        )}
      </div>

      <p className="mt-2 text-xs text-muted-foreground">
        {describeDateRange(range)} {state.onlyAvailable ? 'に空きのある公演' : 'の公演'}{' '}
        <b className="text-sm text-foreground">{isLoading && results.length === 0 ? '…' : `${results.length} 件`}</b>
      </p>
      <PerformanceResultList
        performances={results}
        source={source}
        marks={marks}
        isLoading={isLoading}
        onOpen={onOpen}
        empty={<>条件に合う公演がありません。日付やエリアを変えてみてください。</>}
      />
    </TopSection>
  )
}

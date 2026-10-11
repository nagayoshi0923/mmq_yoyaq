import { useMemo, useState } from 'react'
import { CalendarDays, Check } from 'lucide-react'
import { ChipButton } from '@/components/public-top/ChipButton'
import { DatePickerPopover } from '@/components/public-top/DatePickerPopover'
import { PeoplePicker } from '@/components/public-top/PeoplePicker'
import { PerformanceResultList } from '@/components/public-top/PerformanceResultList'
import { StorePicker, type StoreOption } from '@/components/public-top/StorePicker'
import { TopSection } from '@/components/public-top/TopSection'
import type { PerformanceSearchState } from '@/components/public-top/usePerformanceSearchParams'
import {
  DATE_PRESETS,
  datePresetRange,
  datesWithOpenings,
  describeDateRange,
  searchPerformances,
  type PublicPerformance,
} from '@/lib/publicPerformanceSearch'
import { formatJstMonthDay } from '@/utils/jstDate'

interface StoreSearchSectionProps {
  performances: PublicPerformance[]
  isLoading: boolean
  state: PerformanceSearchState
  onChange: (patch: Partial<PerformanceSearchState>) => void
  storeOptions: StoreOption[]
  today: string
  maxDate: string
  nowMs: number
  primaryColor: string
  onSelect: (p: PublicPerformance) => void
}

/** 店舗トップ「空いている公演を探す」 */
export function StoreSearchSection({ performances, isLoading, state, onChange, storeOptions, today, maxDate, nowMs, primaryColor, onSelect }: StoreSearchSectionProps) {
  const [pickerOpen, setPickerOpen] = useState(false)
  const range = useMemo(() => datePresetRange(state.preset, today, state.date), [state.preset, state.date, today])
  const results = useMemo(() => searchPerformances(performances, {
    range,
    people: state.people,
    onlyAvailable: state.onlyAvailable,
    beginnerOnly: state.beginnerOnly,
    storeIds: state.storeIds,
  }, nowMs), [performances, range, state.people, state.onlyAvailable, state.beginnerOnly, state.storeIds, nowMs])
  const openDates = useMemo(() => datesWithOpenings(performances, state.people, nowMs), [performances, state.people, nowMs])
  const hasBeginner = useMemo(() => performances.some((p) => p.beginner_friendly), [performances])
  const resetKey = `${range.from}_${range.to}_${state.people}_${state.onlyAvailable}_${state.beginnerOnly}_${state.storeIds.join(',')}`

  return (
    <TopSection id="search" title="空いている公演を探す">
      <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1 scroll-row">
        {DATE_PRESETS.map((d) => (
          <ChipButton key={d.value} selected={state.preset === d.value} primaryColor={primaryColor} onClick={() => onChange({ preset: d.value })}>
            {d.label}
          </ChipButton>
        ))}
        <DatePickerPopover
          value={state.preset === 'date' ? range.from : null}
          today={today}
          maxDate={maxDate}
          markedDates={openDates}
          open={pickerOpen}
          onOpenChange={setPickerOpen}
          onSelect={(date) => { onChange({ preset: 'date', date }); setPickerOpen(false) }}
        >
          <ChipButton selected={state.preset === 'date'} primaryColor={primaryColor}>
            <CalendarDays className="h-4 w-4" aria-hidden />
            {state.preset === 'date' ? formatJstMonthDay(range.from, true) : '日付を選ぶ'}
          </ChipButton>
        </DatePickerPopover>
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        <PeoplePicker value={state.people} onChange={(people) => onChange({ people })} />
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
        {describeDateRange(range)} {state.onlyAvailable ? `に ${state.people} 名で入れる公演` : 'の公演'}{' '}
        <b className="text-sm text-foreground">{isLoading && results.length === 0 ? '…' : `${results.length} 件`}</b>
      </p>
      <PerformanceResultList
        performances={results}
        isLoading={isLoading}
        resetKey={resetKey}
        onSelect={onSelect}
        empty={<>条件に合う公演がありません。日付や人数を変えてみてください。</>}
      />
      {results.length > 0 && <p className="mt-1.5 text-xs text-muted-foreground">押すと作品ページが、その公演を選んだ状態で開きます。</p>}
    </TopSection>
  )
}

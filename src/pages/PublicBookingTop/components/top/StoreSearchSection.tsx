import { useMemo, useState } from 'react'
import { CalendarDays, Check, List } from 'lucide-react'
import { ChipButton } from '@/components/public-top/ChipButton'
import { PerformanceResultList } from '@/components/public-top/PerformanceResultList'
import { StorePicker, type StoreOption } from '@/components/public-top/StorePicker'
import { TopSection } from '@/components/public-top/TopSection'
import type { PerformanceSearchState } from '@/components/public-top/usePerformanceSearchParams'
import type { ScenarioCardData, ScenarioCardSource } from '@/components/public-top/scenarioCards'
import type { ScenarioMarks } from '@/components/public-top/useScenarioMarks'
import {
  DATE_PRESETS,
  DEFAULT_DATE_PRESET,
  describeDateRange,
  resolvePresetRange,
  searchPerformances,
  type PublicPerformance,
} from '@/lib/publicPerformanceSearch'
import type { EnrichedPublicEvent, PublicEventRow, PublicStoreRow, ScenarioCard } from '../../hooks/useBookingData'
import { ClassicCalendar, ClassicList } from './ClassicViews'

interface StoreSearchSectionProps {
  performances: PublicPerformance[]
  isLoading: boolean
  state: PerformanceSearchState
  onChange: (patch: Partial<PerformanceSearchState>) => void
  storeOptions: StoreOption[]
  today: string
  nowMs: number
  primaryColor: string
  /** 結果の作品カードの材料 */
  source: ScenarioCardSource
  marks?: ScenarioMarks | null
  onOpen: (card: ScenarioCardData) => void
  /** 元のカレンダー・リスト用 */
  classic: {
    organizationId: string | null
    allEvents: EnrichedPublicEvent[]
    blockedSlots: PublicEventRow[]
    stores: PublicStoreRow[]
    scenarios: ScenarioCard[]
    organizationSlug: string
    organizationName: string | null
    privateBookingDeadlineDays: number
    onCardClick: (scenarioId: string) => void
  }
}

/**
 * 店舗トップ「空いている公演を探す」。
 * チップ「今週／来週／今月」は日付順のカード（店舗・空席あり・初心者向けで絞れる）、
 * 「カレンダー」「リスト」は元の部品（年月・店舗・満席を非表示の操作）を出す（2026-10-12 社長決定）。
 * 人数の絞り込みは置かない（2026-10-12 社長指示。空席ありは 1 名以上の空き）。
 */
export function StoreSearchSection({ performances, isLoading, state, onChange, storeOptions, today, nowMs, primaryColor, source, marks, onOpen, classic }: StoreSearchSectionProps) {
  // 元のカレンダー・リストの操作（両方で共通にし、切り替えても保つ）
  const [classicStoreIds, setClassicStoreIds] = useState<string[]>([])
  const [hideSoldOut, setHideSoldOut] = useState(false)
  const [hidePlayed, setHidePlayed] = useState(false)
  const isCards = state.view === 'cards'
  // カレンダー・リストから日付のチップに戻るときは「今週」から（日付の指定は持ち越さない）
  const preset = state.preset === 'date' ? DEFAULT_DATE_PRESET : state.preset
  const { range, results } = useMemo(() => {
    const search = (r: ReturnType<typeof resolvePresetRange>) => searchPerformances(performances, {
      range: r,
      onlyAvailable: state.onlyAvailable,
      beginnerOnly: state.beginnerOnly,
      storeIds: state.storeIds,
    }, nowMs)
    // 「今週」が 0 件なら「来週」に切り替える（読み込み中は切り替えない）
    const r = resolvePresetRange(preset, today, null, (cand) => (isLoading ? 1 : search(cand).length))
    return { range: r, results: search(r) }
  }, [performances, preset, today, isLoading, state.onlyAvailable, state.beginnerOnly, state.storeIds, nowMs])
  const hasBeginner = useMemo(() => performances.some((p) => p.beginner_friendly), [performances])
  const resetKey = `${range.from}_${range.to}_${state.onlyAvailable}_${state.beginnerOnly}_${state.storeIds.join(',')}`
  const classicProps = {
    ...classic,
    storeOptions,
    selectedStoreIds: classicStoreIds,
    onStoreIdsChange: setClassicStoreIds,
    hideSoldOut,
    onHideSoldOutChange: setHideSoldOut,
    hidePlayed,
    onHidePlayedChange: setHidePlayed,
    primaryColor,
  }

  return (
    <TopSection id="search" title="空いている公演を探す">
      <div className="flex flex-wrap gap-1.5" role="group" aria-label="日付・見方">
        {DATE_PRESETS.map((d) => (
          <ChipButton key={d.value} selected={isCards && preset === d.value} primaryColor={primaryColor} onClick={() => onChange({ preset: d.value, view: 'cards' })}>
            {d.label}
          </ChipButton>
        ))}
        <ChipButton selected={state.view === 'calendar'} primaryColor={primaryColor} onClick={() => onChange({ view: 'calendar' })}>
          <CalendarDays className="h-4 w-4" aria-hidden />カレンダー
        </ChipButton>
        <ChipButton selected={state.view === 'list'} primaryColor={primaryColor} onClick={() => onChange({ view: 'list' })}>
          <List className="h-4 w-4" aria-hidden />リスト
        </ChipButton>
      </div>

      {isCards && (
        <>
          <div className="mt-2 flex flex-wrap gap-1.5">
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
            resetKey={resetKey}
            onOpen={onOpen}
            empty={<>条件に合う公演がありません。日付や条件を変えてみてください。</>}
          />
          {results.length > 0 && <p className="mt-1.5 text-xs text-muted-foreground">カードを押すと作品ページが、色付きの公演を選んだ状態で開きます。</p>}
        </>
      )}
      {state.view === 'calendar' && <div className="mt-2"><ClassicCalendar {...classicProps} /></div>}
      {state.view === 'list' && <div className="mt-2"><ClassicList {...classicProps} /></div>}
    </TopSection>
  )
}

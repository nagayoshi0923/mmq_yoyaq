import { useMemo, useState } from 'react'
import { Check } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { MonthGrid } from '@/components/public-top/MonthGrid'
import { StorePicker } from '@/components/public-top/StorePicker'
import type { PerformanceSearchState } from '@/components/public-top/usePerformanceSearchParams'
import { groupPerformancesIntoCards, type ScenarioCardData, type ScenarioCardSource } from '@/components/public-top/scenarioCards'
import type { ScenarioMarks } from '@/components/public-top/useScenarioMarks'
import { RenewalSection } from '@/components/renewal/RenewalSection'
import { RenewalChip } from '@/components/renewal/RenewalChip'
import { PosterCard } from '@/components/renewal/PosterCard'
import { durationLabel, playersLabel, seatsLabel } from '@/components/renewal/labels'
import { DATE_PRESETS, DEFAULT_DATE_PRESET, type DateRange, type PublicPerformance } from '@/lib/publicPerformanceSearch'
import { shortPrefecture } from '@/lib/publicStoreName'
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
  /** 末尾の「もっと見る」（次の 30 日を足す）を出すか */
  canShowMore?: boolean
  onMore?: () => void
  /** 先の月を読み足している途中か・読めなかったか */
  extraState?: 'ready' | 'loading' | 'error'
  onRetryExtra?: () => void
}

/** エリアのチップに直接並べる数（残りは「ほか」の中） */
const AREA_CHIPS = 3

/**
 * MMQ 全体トップ「空いている公演を探す」（刷新版。Figma プロトタイプ MMQトップの 7 番目の区画）。
 * 探している範囲 →「組織・店舗で絞る」、日付のチップ（今週／来週／日付を選ぶ）、エリアのチップ（全国／上位 3 つ／ほか）、
 * 件数と「条件を足す」（空席あり・初心者向け・店舗）、結果は作品ごとに横長の画像のカードを 1 列（PC は 2 列）。
 * 既定は今日から 30 日。末尾の「もっと見る」で次の 30 日を足す。選んでいる日付のチップをもう一度押すと既定に戻る。
 */
export function PlatformSearchSection({
  performances, results, range, isLoading, state, onChange, prefectures, today, maxDate, markedDates, primaryColor, source, onOpen,
  canShowMore = false, onMore, extraState = 'ready', onRetryExtra,
}: PlatformSearchSectionProps) {
  const [dateOpen, setDateOpen] = useState(false)
  const [moreAreaOpen, setMoreAreaOpen] = useState(false)
  const [filterOpen, setFilterOpen] = useState(false)
  const storeOptions = useMemo(() => platformStoreOptions(performances, state.area), [performances, state.area])
  const hasBeginner = useMemo(() => performances.some((p) => p.beginner_friendly), [performances])
  const shownAreas = prefectures.slice(0, AREA_CHIPS)
  const otherAreas = prefectures.slice(AREA_CHIPS)
  const areaInOthers = !!state.area && otherAreas.includes(state.area)

  const cards = useMemo(
    () => groupPerformancesIntoCards(results, source.upcoming, { highlight: true, meta: source.meta, showOrganization: source.showOrganization }),
    [results, source],
  )
  // カードの「組織・都道府県」（カードには都道府県が無いので、該当した公演から引く）
  const prefectureOf = useMemo(() => {
    const map = new Map<string, string>()
    for (const p of results) {
      const k = `${p.organization_id}_${p.scenario_id}`
      if (!map.has(k) && p.prefecture) map.set(k, shortPrefecture(p.prefecture))
    }
    return map
  }, [results])

  const scope = [
    state.area ? `${shortPrefecture(state.area)}の公演` : '全国の公演',
    state.storeIds.length > 0 ? `${state.storeIds.length}店舗` : null,
  ].filter(Boolean).join('・')
  const extraCount = (state.onlyAvailable ? 0 : 1) + (state.beginnerOnly ? 1 : 0) + (state.storeIds.length > 0 ? 1 : 0)

  return (
    <RenewalSection id="results" title="空いている公演を探す">
      <div className="flex items-end justify-between gap-3">
        <div>
          <p className="text-xs text-muted-foreground">探している範囲</p>
          <p className="text-base font-bold">{scope}</p>
        </div>
        <button type="button" onClick={() => setFilterOpen(true)} className="pb-0.5 text-sm underline underline-offset-4 hover:opacity-70">
          組織・店舗で絞る
        </button>
      </div>

      <div className="-mx-4 mt-4 flex gap-2 overflow-x-auto px-4 pb-1 scroll-row" role="group" aria-label="日付">
        {DATE_PRESETS.map((d) => (
          <RenewalChip key={d.value} selected={state.preset === d.value} onClick={() => onChange({ preset: state.preset === d.value ? DEFAULT_DATE_PRESET : d.value })}>
            {d.label}
          </RenewalChip>
        ))}
        <Popover open={dateOpen} onOpenChange={setDateOpen}>
          <PopoverTrigger asChild>
            <RenewalChip selected={state.preset === 'date'}>
              {state.preset === 'date' ? formatJstMonthDay(range.from, true) : '日付を選ぶ'}
            </RenewalChip>
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

      {prefectures.length > 0 && (
        <div className="-mx-4 mt-3 flex gap-2 overflow-x-auto px-4 pb-1 scroll-row" role="group" aria-label="エリア">
          <RenewalChip selected={!state.area} onClick={() => onChange({ area: null, storeIds: [] })}>全国</RenewalChip>
          {shownAreas.map((p) => (
            <RenewalChip key={p} selected={state.area === p} onClick={() => onChange({ area: state.area === p ? null : p, storeIds: [] })}>
              {shortPrefecture(p)}
            </RenewalChip>
          ))}
          {otherAreas.length > 0 && (
            <Popover open={moreAreaOpen} onOpenChange={setMoreAreaOpen}>
              <PopoverTrigger asChild>
                <RenewalChip selected={areaInOthers}>{areaInOthers ? shortPrefecture(state.area!) : 'ほか'}</RenewalChip>
              </PopoverTrigger>
              <PopoverContent align="start" className="w-48 rounded-lg p-1.5">
                {otherAreas.map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => { onChange({ area: p, storeIds: [] }); setMoreAreaOpen(false) }}
                    className={cn('block w-full rounded-md px-2.5 py-2 text-left text-sm hover:bg-muted', state.area === p && 'font-bold')}
                  >
                    {p}
                  </button>
                ))}
              </PopoverContent>
            </Popover>
          )}
        </div>
      )}

      {/* 「条件を足す」は「組織・店舗で絞る」と同じ右寄せ・同じ見た目（2026-11-19 えいきち） */}
      <div className="mt-4 flex items-end justify-between gap-3 text-sm">
        <p className="text-muted-foreground">
          {state.onlyAvailable ? '空席のある公演' : '公演'}{' '}
          <b className="text-lg text-foreground">{isLoading && results.length === 0 ? '…' : `${results.length}件`}</b>
        </p>
        <Popover open={filterOpen} onOpenChange={setFilterOpen}>
          <PopoverTrigger asChild>
            <button type="button" className="pb-0.5 text-sm underline underline-offset-4 hover:opacity-70">
              条件を足す{extraCount > 0 ? `（${extraCount}）` : ''}
            </button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-72 space-y-2 rounded-lg p-3">
            <FilterToggle checked={state.onlyAvailable} onClick={() => onChange({ onlyAvailable: !state.onlyAvailable })}>空席のある公演だけ</FilterToggle>
            {hasBeginner && (
              <FilterToggle checked={state.beginnerOnly} onClick={() => onChange({ beginnerOnly: !state.beginnerOnly })}>初心者向けだけ</FilterToggle>
            )}
            {storeOptions.length > 1 && (
              <div className="border-t pt-2">
                <p className="mb-1.5 text-xs text-muted-foreground">組織・店舗</p>
                <StorePicker options={storeOptions} value={state.storeIds} onChange={(storeIds) => onChange({ storeIds })} primaryColor={primaryColor} />
              </div>
            )}
            <button type="button" onClick={() => setFilterOpen(false)} className="w-full rounded-md border border-input py-2 text-sm font-medium hover:bg-muted">閉じる</button>
          </PopoverContent>
        </Popover>
      </div>

      {isLoading && results.length === 0 ? (
        <div className="mt-4 grid gap-8 md:grid-cols-2" aria-busy="true">
          {Array.from({ length: 2 }).map((_, i) => <div key={i} className="aspect-[16/9] animate-pulse bg-muted" />)}
        </div>
      ) : cards.length === 0 ? (
        <div className="mt-4 bg-muted/50 p-4 text-center text-sm text-muted-foreground">条件に合う公演がありません。日付やエリアを変えてみてください。</div>
      ) : (
        <div className="mt-4 grid gap-x-6 gap-y-10 md:grid-cols-2" data-testid="performance-search-results">
          {cards.map((card) => {
            const first = card.events[0]
            const others = card.total_events_count - 1
            const pref = prefectureOf.get(card.key)
            return (
              <PosterCard
                key={card.key}
                shape="wide"
                title={card.title}
                imageUrl={card.key_visual_url}
                place={[card.organization_badge, pref].filter(Boolean).join('・')}
                meta={[playersLabel(card.player_count_min, card.player_count_max), durationLabel(card.duration_minutes), card.fee ? `${card.fee.toLocaleString('ja-JP')}円〜` : null].filter(Boolean).join('・')}
                event={first ? { date: first.date, start_time: first.start_time, store_name: first.store_name, seats: seatsLabel(first.available_seats) } : null}
                footer={others > 0 ? `ほか${others}回` : undefined}
                onOpen={() => onOpen(card)}
              />
            )
          })}
        </div>
      )}
      {extraState === 'loading' && <p className="mt-3 text-sm text-muted-foreground" role="status" data-testid="performance-search-extra-loading">先の公演を読み込み中…</p>}
      {extraState === 'error' && (
        <p className="mt-3 text-sm text-destructive" role="alert" data-testid="performance-search-extra-error">
          先の公演を読み込めませんでした。<button type="button" className="underline" onClick={onRetryExtra}>もう一度読み込む</button>
        </p>
      )}
      {canShowMore && onMore && (
        <div className="mt-6 flex justify-center">
          <RenewalChip onClick={onMore} data-testid="performance-search-more">もっと見る（次の30日）</RenewalChip>
        </div>
      )}
    </RenewalSection>
  )
}

function FilterToggle({ checked, onClick, children }: { checked: boolean; onClick: () => void; children: string }) {
  return (
    <button type="button" aria-pressed={checked} onClick={onClick} className="flex w-full items-center gap-2 rounded-md px-1 py-1.5 text-left text-sm hover:bg-muted">
      <span className={cn('flex h-5 w-5 items-center justify-center rounded border', checked ? 'border-[#111] bg-[#111] text-white' : 'border-gray-300')}>
        {checked && <Check className="h-3.5 w-3.5" aria-hidden />}
      </span>
      {children}
    </button>
  )
}

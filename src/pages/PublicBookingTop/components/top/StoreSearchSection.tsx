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
  /** 「もっと見る」を押した回数 + 1（今日から windows × 30 日を出す） */
  windows: number
  onMore: () => void
  /** 「もっと見る」を出す最後の日（予約を受け付けている公開の公演のうち、いちばん先の日付。無ければ出さない） */
  moreUntil: string | null
  /** カードの期間のうち、先の月を読み足している途中か・読めなかったか */
  extraState: 'ready' | 'loading' | 'error'
  onRetryExtra: () => void
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
    lastMonth: Date | null
    /** 月送りの上限が確定したか（この組織の最新の取得が終わった）。確定前は最後の月へ戻さない */
    limitReady?: boolean
    onVisibleMonthChange: (month: Date) => void
    monthStatus: (month: Date) => 'loading' | 'error' | 'ready'
    onRetryMonth: (month: Date) => void
  }
}

/**
 * 店舗トップ「空いている公演を探す」。
 * 既定は今日から 30 日の日付順のカード（店舗・空席あり・初心者向けで絞れる）。末尾の「もっと見る」で次の 30 日を足す
 * （2026-10-25 社長指示「今月バッジ廃止、予定公演を30日分、末尾にもっとみる」。件数では切らない）。
 * チップ「今週／来週」はその週のカード、「カレンダー」「リスト」は元の部品（年月・店舗・満席を非表示の操作）を出す（2026-10-12 社長決定）。
 * 選んでいるチップをもう一度押すと既定（今日から 30 日のカード）に戻る。
 * 人数の絞り込みは置かない（2026-10-12 社長指示。空席ありは 1 名以上の空き）。
 */
export function StoreSearchSection({ performances, isLoading, state, onChange, storeOptions, today, nowMs, primaryColor, source, marks, onOpen, windows, onMore, moreUntil, extraState, onRetryExtra, classic }: StoreSearchSectionProps) {
  // 元のカレンダー・リストの操作（両方で共通にし、切り替えても保つ）
  const [classicStoreIds, setClassicStoreIds] = useState<string[]>([])
  const [hideSoldOut, setHideSoldOut] = useState(false)
  const [hidePlayed, setHidePlayed] = useState(false)
  const isCards = state.view === 'cards'
  // 店舗トップに日付の指定は無い（?when=date は既定で開く）
  const preset = state.preset === 'date' ? DEFAULT_DATE_PRESET : state.preset
  const { range, results } = useMemo(() => {
    const search = (r: ReturnType<typeof resolvePresetRange>) => searchPerformances(performances, {
      range: r,
      onlyAvailable: state.onlyAvailable,
      beginnerOnly: state.beginnerOnly,
      storeIds: state.storeIds,
    }, nowMs)
    // 「今週」が 0 件なら「来週」に切り替える（読み込み中は切り替えない）。既定は今日から windows × 30 日
    const r = resolvePresetRange(preset, today, null, (cand) => (isLoading ? 1 : search(cand).length), windows)
    return { range: r, results: search(r) }
  }, [performances, preset, today, isLoading, state.onlyAvailable, state.beginnerOnly, state.storeIds, nowMs, windows])
  // 先に予約を受け付けている公開の公演があるときだけ「もっと見る」
  const canShowMore = preset === DEFAULT_DATE_PRESET && !!moreUntil && range.to < moreUntil
  const hasBeginner = useMemo(() => performances.some((p) => p.beginner_friendly), [performances])
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
      {/* 見本 Top.dc.html の .chips: 1 行の横スクロール（折り返さない）。絞り込みのチップは下の行で折り返してよい */}
      <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1 scroll-row" role="group" aria-label="日付・見方">
        {DATE_PRESETS.map((d) => (
          <ChipButton key={d.value} selected={isCards && preset === d.value} primaryColor={primaryColor} onClick={() => onChange({ preset: isCards && preset === d.value ? DEFAULT_DATE_PRESET : d.value, view: 'cards' })}>
            {d.label}
          </ChipButton>
        ))}
        <ChipButton selected={state.view === 'calendar'} primaryColor={primaryColor} onClick={() => onChange(state.view === 'calendar' ? { view: 'cards', preset: DEFAULT_DATE_PRESET } : { view: 'calendar' })}>
          <CalendarDays className="h-4 w-4" aria-hidden />カレンダー
        </ChipButton>
        <ChipButton selected={state.view === 'list'} primaryColor={primaryColor} onClick={() => onChange(state.view === 'list' ? { view: 'cards', preset: DEFAULT_DATE_PRESET } : { view: 'list' })}>
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
            onOpen={onOpen}
            empty={<>条件に合う公演がありません。日付や条件を変えてみてください。</>}
          />
          {extraState === 'loading' && <p className="mt-2 text-sm text-muted-foreground" role="status" data-testid="performance-search-extra-loading">先の公演を読み込み中…</p>}
          {extraState === 'error' && (
            <p className="mt-2 text-sm text-destructive" role="alert" data-testid="performance-search-extra-error">
              先の公演を読み込めませんでした。<button type="button" className="underline" onClick={onRetryExtra}>もう一度読み込む</button>
            </p>
          )}
          {canShowMore && (
            <div className="mt-3 flex justify-center">
              <ChipButton onClick={onMore} data-testid="performance-search-more">もっと見る（次の 30 日）</ChipButton>
            </div>
          )}
          {results.length > 0 && <p className="mt-1.5 text-xs text-muted-foreground">カードを押すと作品ページが、色付きの公演を選んだ状態で開きます。</p>}
        </>
      )}
      {state.view === 'calendar' && <div className="mt-2"><ClassicCalendar {...classicProps} /></div>}
      {state.view === 'list' && <div className="mt-2"><ClassicList {...classicProps} /></div>}
    </TopSection>
  )
}

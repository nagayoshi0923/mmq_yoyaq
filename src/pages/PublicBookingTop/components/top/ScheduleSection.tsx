import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ChevronRight } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { RenewalSection } from '@/components/renewal/RenewalSection'
import { RenewalChip } from '@/components/renewal/RenewalChip'
import { PRIVATE_PURPLE } from '@/components/renewal/fonts'
import { seatsLabel } from '@/components/renewal/labels'
import type { StoreOption } from '@/components/public-top/StorePicker'
import { comparePerformances, isBookableNow, performanceDetailPath, type PublicPerformance } from '@/lib/publicPerformanceSearch'
import { formatJstMonthDay, formatJstWeekday } from '@/utils/jstDate'
import { cn } from '@/lib/utils'

interface ScheduleSectionProps {
  organizationName: string
  performances: PublicPerformance[]
  isLoading: boolean
  storeOptions: StoreOption[]
  storeIds: string[]
  onStoreIdsChange: (ids: string[]) => void
  today: string
  nowMs: number
  /** 見せている期間の終わり（YYYY-MM-DD） */
  until: string
  /** 「もっと先の公演を見る」（無ければ出さない） */
  onMore?: () => void
  extraState?: 'ready' | 'loading' | 'error'
  onRetryExtra?: () => void
  /** 貸切のタブの「貸切できる作品を見る」 */
  privatePath: string
  privateGuidePath: string
  onOpen: (path: string) => void
}

/** 店舗のチップに直接並べる数（残りは「ほか」の中） */
const STORE_CHIPS = 3

/**
 * 組織トップ「公演スケジュール」（刷新版。Figma プロトタイプ 組織トップの 6 番目の区画）。
 * 上に「公演に参加する／貸切で遊ぶ」の切り替え、店舗のチップ、「今後2週間 N回」と「空席のある回だけ」、
 * 日付ごとに「時刻・作品名と店舗・残席」の行（満席は薄く）、いちばん下に「もっと先の公演を見る」。
 */
export function ScheduleSection({
  organizationName, performances, isLoading, storeOptions, storeIds, onStoreIdsChange, today, nowMs, until,
  onMore, extraState = 'ready', onRetryExtra, privatePath, privateGuidePath, onOpen,
}: ScheduleSectionProps) {
  const [tab, setTab] = useState<'public' | 'private'>('public')
  const [onlyAvailable, setOnlyAvailable] = useState(false)
  const [moreOpen, setMoreOpen] = useState(false)
  const shownStores = storeOptions.slice(0, STORE_CHIPS)
  const otherStores = storeOptions.slice(STORE_CHIPS)
  const selectedOther = storeIds.length === 1 && otherStores.some((o) => o.id === storeIds[0]) ? otherStores.find((o) => o.id === storeIds[0]) : null

  const rows = useMemo(() => performances
    .filter((p) => p.date >= today && p.date <= until && isBookableNow(p, nowMs))
    .filter((p) => storeIds.length === 0 || (p.store_id != null && storeIds.includes(p.store_id)))
    .filter((p) => !onlyAvailable || p.available_seats > 0)
    .sort(comparePerformances), [performances, today, until, nowMs, storeIds, onlyAvailable])
  const byDate = useMemo(() => {
    const map = new Map<string, PublicPerformance[]>()
    rows.forEach((p) => { const a = map.get(p.date); if (a) a.push(p); else map.set(p.date, [p]) })
    return [...map.entries()]
  }, [rows])
  const days = Math.round((Date.parse(until) - Date.parse(today)) / 86_400_000) + 1
  const periodLabel = days === 14 ? '今後2週間' : `${formatJstMonthDay(until)}まで`

  return (
    <RenewalSection id="results" title="公演スケジュール" lead={`${organizationName}の全店舗・日付順`}>
      <div className="flex rounded-full bg-gray-200/70 p-1" role="tablist" aria-label="遊び方">
        {([['public', '公演に参加する'], ['private', '貸切で遊ぶ']] as const).map(([key, label]) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={tab === key}
            onClick={() => setTab(key)}
            className={cn('h-10 flex-1 rounded-full text-sm', tab === key ? 'bg-white font-bold shadow-sm' : 'text-muted-foreground')}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'private' ? (
        <div className="mt-5">
          <p className="text-sm leading-relaxed">4〜8人そろえば、好きな作品を好きな日に貸切で遊べます。作品を選んで、店舗の空いている日から候補日を選びます。</p>
          <Link to={privatePath} className="mt-4 flex h-14 w-full items-center justify-center rounded-[2px] text-base font-bold text-white hover:opacity-90" style={{ backgroundColor: PRIVATE_PURPLE }}>
            貸切できる作品を見る
          </Link>
          <Link to={privateGuidePath} className="mt-3 inline-block text-sm underline underline-offset-4">貸切の流れ</Link>
        </div>
      ) : (
        <>
          {storeOptions.length > 1 && (
            <div className="mt-4 flex flex-wrap gap-2" role="group" aria-label="店舗">
              <RenewalChip selected={storeIds.length === 0} onClick={() => onStoreIdsChange([])}>すべての店舗</RenewalChip>
              {shownStores.map((o) => (
                <RenewalChip key={o.id} selected={storeIds.length === 1 && storeIds[0] === o.id} onClick={() => onStoreIdsChange(storeIds[0] === o.id ? [] : [o.id])}>
                  {o.label}
                </RenewalChip>
              ))}
              {otherStores.length > 0 && (
                <Popover open={moreOpen} onOpenChange={setMoreOpen}>
                  <PopoverTrigger asChild>
                    <RenewalChip selected={!!selectedOther}>{selectedOther?.label ?? 'ほか'}</RenewalChip>
                  </PopoverTrigger>
                  <PopoverContent align="start" className="w-52 rounded-lg p-1.5">
                    {otherStores.map((o) => (
                      <button key={o.id} type="button" onClick={() => { onStoreIdsChange([o.id]); setMoreOpen(false) }} className="block w-full rounded-md px-2.5 py-2 text-left text-sm hover:bg-muted">
                        {o.label}
                      </button>
                    ))}
                  </PopoverContent>
                </Popover>
              )}
            </div>
          )}

          <div className="mt-4 flex items-baseline justify-between gap-3">
            <p className="text-sm text-muted-foreground">
              {periodLabel} <b className="text-lg text-foreground">{isLoading && rows.length === 0 ? '…' : `${rows.length}回`}</b>
            </p>
            <button type="button" aria-pressed={onlyAvailable} onClick={() => setOnlyAvailable((v) => !v)} className={cn('text-sm underline underline-offset-4', onlyAvailable && 'font-bold')}>
              {onlyAvailable ? '満席の回も見る' : '空席のある回だけ'}
            </button>
          </div>

          {isLoading && rows.length === 0 ? (
            <div className="mt-3 space-y-2" aria-busy="true">{Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-14 animate-pulse bg-muted" />)}</div>
          ) : byDate.length === 0 ? (
            <p className="mt-3 bg-muted/50 p-4 text-center text-sm text-muted-foreground">この期間に公演はありません。店舗を変えるか、もっと先の公演を見てください。</p>
          ) : (
            <div className="mt-2" data-testid="schedule-list">
              {byDate.map(([date, list]) => (
                <div key={date} className="mt-3">
                  <h3 className="border-b-2 border-[#111] pb-2 text-base font-bold">{formatJstMonthDay(date)}（{formatJstWeekday(date)}）</h3>
                  <ul className="divide-y divide-gray-200">
                    {list.map((p) => {
                      const full = p.available_seats <= 0
                      return (
                        <li key={p.id}>
                          <button type="button" onClick={() => onOpen(performanceDetailPath(p))} className={cn('flex w-full items-center gap-4 py-3 text-left hover:bg-white/60', full && 'text-gray-400')}>
                            <span className="w-12 shrink-0 text-base font-bold">{p.start_time.slice(0, 5)}</span>
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-base font-bold">{p.title}</span>
                              <span className={cn('block truncate text-xs', full ? 'text-gray-400' : 'text-muted-foreground')}>{p.store_short_name ?? p.store_name}</span>
                            </span>
                            <span className="shrink-0 text-xs font-bold">{full ? <span className="font-normal">満席</span> : seatsLabel(p.available_seats)}</span>
                            <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                          </button>
                        </li>
                      )
                    })}
                  </ul>
                </div>
              ))}
            </div>
          )}
          {extraState === 'loading' && <p className="mt-3 text-sm text-muted-foreground" role="status">先の公演を読み込み中…</p>}
          {extraState === 'error' && (
            <p className="mt-3 text-sm text-destructive" role="alert">先の公演を読み込めませんでした。<button type="button" className="underline" onClick={onRetryExtra}>もう一度読み込む</button></p>
          )}
          {onMore && (
            <button type="button" onClick={onMore} className="mt-4 text-sm underline underline-offset-4" data-testid="schedule-more">もっと先の公演を見る</button>
          )}
        </>
      )}
    </RenewalSection>
  )
}

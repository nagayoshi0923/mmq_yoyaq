import { memo } from 'react'
import { CheckCheck, Clock, Heart, Users } from 'lucide-react'
import { cn, getColorFromName } from '@/lib/utils'
import { formatJstMonthDay, formatJstWeekday, getJstWeekdayIndex } from '@/utils/jstDate'
import { SeatChips } from './SeatChips'
import { ScenarioCardImage } from './ScenarioCardImage'
import { scenarioCardRibbon, type ScenarioCardData } from './scenarioCards'
import type { ScenarioMarks } from './useScenarioMarks'

/** 次回公演の行は 2 件まで（探す結果で該当が多いときは 4 件まで該当の行を出す） */
const EVENT_ROWS = 2
const MAX_HIGHLIGHT_ROWS = 4

function formatPlayers(min: number, max: number): string {
  return min === max ? `${max}人` : `${min}-${max}人`
}

function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes}分`
  const m = minutes % 60
  return `${Math.floor(minutes / 60)}h${m > 0 ? `${m}m` : ''}`
}

interface ScenarioCardProps {
  card: ScenarioCardData
  onOpen: (card: ScenarioCardData) => void
  /** ログイン中だけ: 遊びたい・体験済み */
  marks?: ScenarioMarks | null
  className?: string
}

/**
 * 作品カード（本番 main の ScenarioCard の見た目に戻したもの。2026-10-13 社長承認の見本）。
 * 角なし・枠線、画像 3:4 と左下の帯、作者と体験済み・遊びたい、作品名（2 行まで）、人数・時間・参加費、
 * 次回公演 2 件（店舗色の縦棒・日付と曜日・時刻・店舗・残席チップ）と「+N件」。
 * 押すと card.path（公演を選んだ状態の作品ページ、または作品ページ）へ。
 */
export const ScenarioCard = memo(function ScenarioCard({ card, onOpen, marks, className }: ScenarioCardProps) {
  const ribbon = scenarioCardRibbon(card)
  const highlighted = card.events.filter((e) => e.highlighted).length
  const rows = card.events.slice(0, Math.max(EVENT_ROWS, Math.min(highlighted, MAX_HIGHLIGHT_ROWS)))
  const more = card.total_events_count - rows.length
  const isPlayed = marks?.isPlayed(card.scenario_id) ?? false
  const isFavorite = marks?.isFavorite(card.scenario_id) ?? false

  return (
    <div
      role="link"
      tabIndex={0}
      aria-label={card.title}
      className={cn('group min-w-0 cursor-pointer text-left [container-type:inline-size] [container-name:scenario-card]', className)}
      onClick={() => onOpen(card)}
      onKeyDown={(e) => { if (e.key === 'Enter') onOpen(card) }}
    >
      <div className="relative flex h-full flex-col overflow-hidden rounded-none border border-gray-200 bg-white transition-all duration-200 group-hover:border-gray-300 group-hover:shadow-lg">
        <div className="relative aspect-[3/4] w-full shrink-0 overflow-hidden bg-gray-100">
          <ScenarioCardImage src={card.key_visual_url} alt={card.title} />
          {card.organization_badge && (
            <div className="absolute left-0 top-0 max-w-full truncate bg-black/55 px-2 py-0.5 ts-10 font-bold text-white">{card.organization_badge}</div>
          )}
          {ribbon && <div className={cn('absolute bottom-0 left-0 px-3 py-1 text-xs font-bold', ribbon.className)}>{ribbon.label}</div>}
        </div>

        <div className="min-w-0 flex-1 p-2 sm:p-3">
          <div className="mb-1 flex items-center justify-between gap-1">
            <p className="min-w-0 truncate text-xs text-muted-foreground">{card.author}</p>
            <div className="flex shrink-0 items-center gap-0.5">
              <button
                type="button"
                aria-label={isPlayed ? '体験済みを外す' : '体験済みにする'}
                aria-pressed={isPlayed}
                disabled={!marks}
                onClick={(e) => { e.stopPropagation(); marks?.togglePlayed(card.scenario_id, card.title) }}
                className={cn('rounded-sm p-1 transition-colors', marks ? 'cursor-pointer hover:bg-green-50' : 'cursor-default')}
              >
                <CheckCheck className={cn('h-4 w-4', isPlayed ? 'text-green-500' : 'text-muted-foreground/40')} />
              </button>
              {marks && (
                <button
                  type="button"
                  aria-label={isFavorite ? '遊びたいから外す' : '遊びたいに入れる'}
                  aria-pressed={isFavorite}
                  onClick={(e) => { e.stopPropagation(); marks.toggleFavorite(card.scenario_id) }}
                  className="rounded-sm p-1 transition-colors hover:bg-red-50"
                >
                  <Heart className={cn('h-4 w-4 fill-current text-red-500', isFavorite ? 'opacity-100' : 'opacity-30')} />
                </button>
              )}
            </div>
          </div>

          <h3 className="mb-2 line-clamp-2 text-sm font-bold leading-snug text-foreground">{card.title}</h3>

          {/* 広いカード: アイコン付きで横に並べる。狭いカード（幅 200px 未満）: アイコンなし・中黒区切りの 1 行、はみ出す参加費だけ「…」 */}
          <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground card-narrow:flex-nowrap card-narrow:gap-x-0 card-narrow:whitespace-nowrap card-narrow:ts-10">
            <span className="flex shrink-0 items-center gap-1"><Users className="h-3 w-3 card-narrow:hidden" />{formatPlayers(card.player_count_min, card.player_count_max)}</span>
            {!!card.duration_minutes && (
              <span className="flex shrink-0 items-center gap-1 card-narrow:gap-0">
                <span aria-hidden className="hidden card-narrow:inline">・</span>
                <Clock className="h-3 w-3 card-narrow:hidden" />{formatDuration(card.duration_minutes)}
              </span>
            )}
            {!!card.fee && (
              <span className="card-narrow:min-w-0 card-narrow:truncate">
                <span aria-hidden className="hidden card-narrow:inline">・</span>¥{card.fee.toLocaleString('ja-JP')}〜
              </span>
            )}
          </div>

          {rows.length > 0 && (
            <div className="space-y-1 border-t border-gray-100 pt-2">
              {rows.map((ev) => {
                const wd = getJstWeekdayIndex(ev.date)
                return (
                  <div
                    key={ev.id}
                    data-highlighted={ev.highlighted || undefined}
                    className={cn('flex items-stretch gap-1 ts-11', ev.highlighted && '-mx-2 bg-orange-50 px-2 py-0.5 sm:-mx-3 sm:px-3')}
                  >
                    <span className="w-[3px] shrink-0" style={{ backgroundColor: ev.store_color ? getColorFromName(ev.store_color) : 'var(--booking-primary)' }} />
                    {/* 広いカード: 日付・時刻・店舗・残席を 1 行。狭いカード: 1 行目「日付(曜日) 時刻」、2 行目「店舗（左）・残席（右）」の決まった 2 行 */}
                    <div className="flex min-w-0 flex-1 items-center gap-x-1 card-narrow:grid card-narrow:grid-cols-[minmax(0,1fr)_auto] card-narrow:gap-y-0.5">
                      <span className="flex shrink-0 items-center gap-x-1 whitespace-nowrap card-narrow:col-span-2">
                        <span className="font-medium text-foreground">
                          {formatJstMonthDay(ev.date)}
                          <span className={cn('ml-0.5 font-normal', wd === 0 ? 'text-red-500' : wd === 6 ? 'text-blue-500' : 'text-muted-foreground')}>
                            ({formatJstWeekday(ev.date)})
                          </span>
                        </span>
                        {ev.start_time && <span className="text-muted-foreground">{ev.start_time.slice(0, 5)}</span>}
                      </span>
                      <span className="min-w-0 truncate text-muted-foreground">{ev.store_name}</span>
                      <SeatChips performance={ev} className="ml-auto shrink-0 justify-self-end" />
                    </div>
                  </div>
                )
              })}
              {more > 0 && <p className="ts-10 text-muted-foreground">+{more}件</p>}
            </div>
          )}
        </div>
      </div>
    </div>
  )
})

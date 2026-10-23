import { memo, type ReactNode } from 'react'
import { CheckCheck, Clock, Heart, Users } from 'lucide-react'
import { cn, getColorFromName } from '@/lib/utils'
import { formatJstMonthDay, formatJstWeekday, getJstWeekdayIndex } from '@/utils/jstDate'
import { SeatChips } from './SeatChips'
import { ScenarioCardImage } from './ScenarioCardImage'
import { scenarioCardRibbon, type ScenarioCardData } from './scenarioCards'
import type { ScenarioMarks } from './useScenarioMarks'

/** 次回公演の行は 2 件まで、残りは「+N件」（探す結果で該当が 3 件以上でも 2 行。2026-10-14 社長指摘・見本どおり） */
const EVENT_ROWS = 2

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
  /** 次回公演の行の代わりに出す欄（貸切できる作品の一覧: 「1 人あたり料金」「貸切できます」） */
  note?: ReactNode
  /** 選ぶ使い方（日時を選んだあとの貸切の作品選び）。指定すると押しボタン扱いで、選択中は枠を太くする */
  selected?: boolean
}

/**
 * 作品カード（本番 main の ScenarioCard の見た目に戻したもの。2026-10-13 社長承認の見本）。
 * 角なし・枠線、画像 3:4 と左下の帯、作者と体験済み・遊びたい、作品名（2 行まで）、人数・時間・参加費、
 * 次回公演 2 件（店舗色の縦棒・日付と曜日・時刻・店舗・残席チップ）と「+N件」。
 * 押すと card.path（公演を選んだ状態の作品ページ、または作品ページ）へ。
 */
export const ScenarioCard = memo(function ScenarioCard({ card, onOpen, marks, className, note, selected }: ScenarioCardProps) {
  const ribbon = scenarioCardRibbon(card)
  const rows = card.events.slice(0, EVENT_ROWS)
  const more = card.total_events_count - rows.length
  const isPlayed = marks?.isPlayed(card.scenario_id) ?? false
  const isFavorite = marks?.isFavorite(card.scenario_id) ?? false

  return (
    <div
      role={selected === undefined ? 'link' : 'button'}
      aria-pressed={selected}
      tabIndex={0}
      aria-label={card.title}
      className={cn('group min-w-0 cursor-pointer text-left [container-type:inline-size] [container-name:scenario-card]', className)}
      onClick={() => onOpen(card)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') onOpen(card)
        else if (selected !== undefined && e.key === ' ' && e.target === e.currentTarget) { e.preventDefault(); onOpen(card) }
      }}
    >
      <div
        className={selected
          ? 'relative flex h-full flex-col overflow-hidden rounded-none border border-booking-primary bg-white ring-2 ring-booking-primary transition-all duration-200 group-hover:shadow-lg'
          : 'relative flex h-full flex-col overflow-hidden rounded-none border border-gray-200 bg-white transition-all duration-200 group-hover:border-gray-300 group-hover:shadow-lg'}
      >
        <div className="relative aspect-[3/4] w-full shrink-0 overflow-hidden bg-gray-100">
          <ScenarioCardImage src={card.key_visual_url} alt={card.title} />
          {card.organization_badge && (
            <div className="absolute left-0 top-0 max-w-full truncate bg-black/55 px-2 py-0.5 ts-10 font-bold text-white">{card.organization_badge}</div>
          )}
          {ribbon && <div className={cn('absolute bottom-0 left-0 px-3 py-1 text-xs font-bold', ribbon.className)}>{ribbon.label}</div>}
        </div>

        {/* 狭いカード（幅 200px 未満。スマホの 2 列・残りわずかの 150px）は見本 Top.dc.html の .pc と同じ寸法: 文字を小さくして各行を 1 行に収める */}
        <div className="min-w-0 flex-1 p-2 sm:p-3 card-narrow:!p-2">
          <div className="mb-1 flex items-center justify-between gap-1 card-narrow:mb-0.5">
            <p className="min-w-0 truncate text-xs text-muted-foreground card-narrow:!ts-11 card-narrow:!fg-gray-500">{card.author}</p>
            <div className="flex shrink-0 items-center gap-0.5 card-narrow:gap-1">
              <button
                type="button"
                aria-label={isPlayed ? '体験済みを外す' : '体験済みにする'}
                aria-pressed={isPlayed}
                disabled={!marks}
                onClick={(e) => { e.stopPropagation(); marks?.togglePlayed(card.scenario_id, card.title) }}
                className={cn('rounded-sm p-1 transition-colors card-narrow:p-0', marks ? 'cursor-pointer hover:bg-green-50' : 'cursor-default')}
              >
                <CheckCheck className={cn('h-4 w-4 card-narrow:h-[13px] card-narrow:w-[13px]', isPlayed ? 'text-green-500' : 'text-muted-foreground/40')} />
              </button>
              {marks && (
                <button
                  type="button"
                  aria-label={isFavorite ? '遊びたいから外す' : '遊びたいに入れる'}
                  aria-pressed={isFavorite}
                  onClick={(e) => { e.stopPropagation(); marks.toggleFavorite(card.scenario_id) }}
                  className="rounded-sm p-1 transition-colors hover:bg-red-50 card-narrow:p-0"
                >
                  <Heart className={cn('h-4 w-4 fill-current text-red-500 card-narrow:h-[13px] card-narrow:w-[13px]', isFavorite ? 'opacity-100' : 'opacity-30')} />
                </button>
              )}
            </div>
          </div>

          <h3 className="mb-2 line-clamp-2 text-sm font-bold leading-snug text-foreground card-narrow:mb-1.5 card-narrow:!ts-13">{card.title}</h3>

          {/* 広いカード: アイコン付きで横に並べる。狭いカード: アイコンなしの 1 行（11px・間隔 10px）、はみ出す参加費だけ「…」 */}
          <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground card-narrow:mb-1.5 card-narrow:flex-nowrap card-narrow:gap-x-2.5 card-narrow:whitespace-nowrap card-narrow:!ts-11 card-narrow:!fg-gray-600">
            <span className="flex shrink-0 items-center gap-1"><Users className="h-3 w-3 card-narrow:hidden" />{formatPlayers(card.player_count_min, card.player_count_max)}</span>
            {!!card.duration_minutes && (
              <span className="flex shrink-0 items-center gap-1"><Clock className="h-3 w-3 card-narrow:hidden" />{formatDuration(card.duration_minutes)}</span>
            )}
            {!!card.fee && <span className="card-narrow:min-w-0 card-narrow:truncate">¥{card.fee.toLocaleString('ja-JP')}〜</span>}
          </div>

          {/* 貸切受付中（公演日が無くても日程相談へ進めることを示す。2026-10-24 社長指示）。押すと作品ページの貸切リクエストのタブ */}
          {card.private_booking_path && (
            <button
              type="button"
              data-testid="private-booking-badge"
              aria-label={`${card.title}の貸切リクエスト（日程相談）へ`}
              onClick={(e) => { e.stopPropagation(); onOpen({ ...card, path: card.private_booking_path! }) }}
              onKeyDown={(e) => e.stopPropagation()}
              className="mb-2 inline-flex max-w-full items-center gap-1 border border-purple-200 bg-purple-50 px-1.5 py-0.5 ts-10 font-bold text-purple-700 hover:bg-purple-100 card-narrow:mb-1.5"
            >
              <span className="shrink-0">貸切受付中</span>
              <span className="truncate font-normal">日程相談 ›</span>
            </button>
          )}

          {rows.length === 0 && card.private_booking_path && !note && (
            <p className="border-t border-gray-100 pt-2 ts-11 text-muted-foreground card-narrow:pt-1.5">公演予定なし・貸切の日程はご相談のうえ決まります</p>
          )}

          {rows.length > 0 && (
            <div className="space-y-1 border-t border-gray-100 pt-2 card-narrow:pt-1.5">
              {rows.map((ev) => {
                const wd = getJstWeekdayIndex(ev.date)
                return (
                  <div
                    key={ev.id}
                    data-highlighted={ev.highlighted || undefined}
                    className={cn('flex items-stretch gap-1 ts-11 card-narrow:items-center', ev.highlighted && '-mx-2 bg-orange-50 px-2 py-0.5 sm:-mx-3 sm:px-3 card-narrow:!-mx-2 card-narrow:!px-2')}
                  >
                    {/* 狭いカード: 左に「縦棒・日付(曜日)・時刻・店舗」、右に残席。縮むのは店舗名だけ。
                        間隔 4px・曜日 10px・残席チップ 2px 5px にして、2〜4 文字の店舗名がなるべく見えるように（2026-10-14 社長指摘） */}
                    <span className="w-[3px] shrink-0 card-narrow:h-3.5" style={{ backgroundColor: ev.store_color ? getColorFromName(ev.store_color) : 'var(--booking-primary)' }} />
                    <div className="flex min-w-0 flex-1 items-center gap-x-1 card-narrow:justify-between card-narrow:gap-x-1">
                      <span className="flex min-w-0 items-center gap-x-1">
                        <span className="shrink-0 whitespace-nowrap font-medium text-foreground card-narrow:font-semibold">
                          {formatJstMonthDay(ev.date)}
                          <span className={cn('ml-0.5 font-normal card-narrow:ml-0 card-narrow:!ts-10', wd === 0 ? 'text-red-500' : wd === 6 ? 'text-blue-500' : 'text-muted-foreground card-narrow:!fg-gray-400')}>
                            ({formatJstWeekday(ev.date)})
                          </span>
                        </span>
                        {ev.start_time && <span className="shrink-0 whitespace-nowrap text-muted-foreground card-narrow:!fg-gray-500">{ev.start_time.slice(0, 5)}</span>}
                        <span className="min-w-0 truncate text-muted-foreground card-narrow:!fg-gray-400">{ev.store_name}</span>
                      </span>
                      <SeatChips performance={ev} className="ml-auto shrink-0" />
                    </div>
                  </div>
                )
              })}
              {more > 0 && <p className="ts-10 text-muted-foreground card-narrow:!fg-gray-400">+{more}件</p>}
            </div>
          )}
          {rows.length === 0 && note && <div className="border-t border-gray-100 pt-2 card-narrow:pt-1.5">{note}</div>}
        </div>
      </div>
    </div>
  )
})

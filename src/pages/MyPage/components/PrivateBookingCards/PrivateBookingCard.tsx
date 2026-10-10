import type { ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { ScheduleActions, absolutePageUrl } from '@/components/patterns/schedule'
import type { PrivateBookingItem } from './privateBookingModel'
import { PRIVATE_BOOKING_TONE as TONE } from './privateBookingTone'

/** 進み具合の小さなチップ列（1 招待 — 2 候補日 — … ／ 確定 — アンケート — 当日） */
function ProgressChips({ item }: { item: PrivateBookingItem }) {
  const tone = TONE[item.tone]
  const { steps, current } = item.progress
  const numbered = steps.length > 3
  const currentLabel = current < steps.length ? steps[current] : '完了'
  return (
    <ol className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground" aria-label={`進み具合: ${currentLabel}`}>
      {steps.map((step, i) => {
        const isCurrent = i === current
        const cls = i < current ? tone.done : isCurrent ? `bg-background ${tone.current}` : 'bg-background border-border'
        return (
          <li key={step} className="flex items-center gap-1.5">
            {i > 0 && <span aria-hidden="true" className="hidden sm:inline-block w-3.5 h-px bg-border" />}
            <span className={`px-2 py-0.5 rounded-full border whitespace-nowrap ${cls}`} aria-current={isCurrent ? 'step' : undefined}>
              {numbered ? `${i + 1} ${step}` : step}
            </span>
          </li>
        )
      })}
    </ol>
  )
}

function Thumbnail({ url, compact }: { url: string | null; compact: boolean }) {
  return (
    <div className={`${compact ? 'w-14 h-[75px]' : 'w-16 h-24 sm:w-[88px] sm:h-[118px]'} flex-shrink-0 bg-muted relative overflow-hidden rounded-sm`}>
      {url ? (
        <>
          <div
            aria-hidden="true"
            className="absolute inset-0 scale-110"
            style={{ backgroundImage: `url(${url})`, backgroundSize: 'cover', backgroundPosition: 'center', filter: 'blur(8px) brightness(0.6)' }}
          />
          <img src={url} alt="" className="relative w-full h-full object-contain" loading="lazy" />
        </>
      ) : (
        <div className="w-full h-full flex items-center justify-center" aria-hidden="true">
          <span className="text-xl opacity-40">🎭</span>
        </div>
      )}
    </div>
  )
}

const BUTTON_BASE = 'h-auto py-2 px-3.5 text-sm rounded-md'
const SECONDARY_BUTTON = `${BUTTON_BASE} bg-background border-zinc-300 text-foreground hover:bg-muted`

interface PrivateBookingCardProps {
  item: PrivateBookingItem
  /** カード右上の「操作」ボタン（PrivateBookingCardActions） */
  actions?: ReactNode
  /** 副ボタンの差し替え（主催者の引き継ぎの「引き継がない」など） */
  secondaryAction?: ReactNode
  /** 主ボタンをマイページ上のダイアログで開く（候補日・日程回答・アンケート）。無ければグループ画面へ移る */
  onOpenInPlace?: (mode: NonNullable<NonNullable<PrivateBookingItem['primary']>['inPlace']>) => void
}

/** 1 貸切 = 1 カード。ヘッダー左に「次にやること」のチップと主催者、右に人数と「操作」 */
export function PrivateBookingCard({ item, actions, secondaryAction, onOpenInPlace }: PrivateBookingCardProps) {
  const navigate = useNavigate()
  const tone = TONE[item.tone]
  const go = (href: string) => navigate(href)
  const secondary = secondaryAction ?? (
    <Button
      type="button"
      variant="outline"
      className={`${SECONDARY_BUTTON} whitespace-nowrap`}
      onClick={e => {
        e.stopPropagation()
        go(item.secondary.href)
      }}
    >
      {item.secondary.label}
    </Button>
  )
  // 確定した貸切はボタン列の下に「カレンダーに登録」「地図を開く」を横並び（押してもカードは開かない）
  const schedule = item.calendar ? (
    <div className="px-3 sm:px-4 pb-3 sm:flex sm:justify-end" onClick={e => e.stopPropagation()} onKeyDown={e => e.stopPropagation()}>
      <ScheduleActions
        event={{ ...item.calendar.event, pageUrl: item.calendar.event.pageUrl ? absolutePageUrl(item.calendar.event.pageUrl) : null }}
        address={item.calendar.address}
        stretch
        className="sm:w-80"
        testId="private-booking-schedule-actions"
      />
    </div>
  ) : null
  return (
    <div
      role="link"
      tabIndex={0}
      aria-label={`${item.title}（${item.label}）を開く`}
      data-testid="private-booking-card"
      data-section={item.section}
      className={`bg-card border ${tone.card} rounded-lg overflow-hidden hover:shadow-md transition-shadow cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-ring`}
      onClick={() => go(item.href)}
      onKeyDown={e => {
        if (e.target !== e.currentTarget) return
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          go(item.href)
        }
      }}
    >
      <div className={`px-3 sm:px-4 py-2.5 flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5 ${tone.header}`}>
        <div className="min-w-0 flex flex-wrap items-center gap-x-2.5 gap-y-1">
          <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${tone.chip}`} data-testid="private-booking-label">{item.label}</span>
          <span className={`text-xs ${tone.sub}`}>{item.hostLabel}</span>
        </div>
        <div className="flex items-center gap-2.5 shrink-0 ml-auto">
          {item.headcount && <span className={`text-xs tabular-nums ${tone.sub}`} aria-label={`参加人数 ${item.headcount}`}>{item.headcount}</span>}
          {actions && <div onClick={e => e.stopPropagation()}>{actions}</div>}
        </div>
      </div>

      {item.compact ? (
        <div className="px-3 sm:px-4 py-3 flex items-center gap-3 sm:gap-4">
          <Thumbnail url={item.imageUrl} compact />
          <div className="flex-1 min-w-0 flex flex-col gap-1">
            <h3 className="font-bold text-foreground text-base leading-tight line-clamp-2">{item.title}</h3>
            <p className="text-sm text-foreground/80 leading-snug" data-testid="private-booking-description">{item.description}</p>
          </div>
          <div className="hidden sm:block shrink-0">{secondary}</div>
        </div>
      ) : (
        <div className="p-3 sm:p-4 flex gap-3 sm:gap-4">
          <Thumbnail url={item.imageUrl} compact={false} />
          <div className="flex-1 min-w-0 flex flex-col gap-2.5">
            <h3 className="font-bold text-foreground text-base sm:text-lg leading-tight line-clamp-2">{item.title}</h3>
            {item.whenWhere && <p className="text-sm text-foreground/80 leading-snug" data-testid="private-booking-when">{item.whenWhere}</p>}
            {item.showProgress && <ProgressChips item={item} />}
            <p className="text-sm text-foreground/80 leading-snug" data-testid="private-booking-description">{item.description}</p>
            <div className="flex flex-wrap gap-2">
              {item.primary && (
                <Button
                  type="button"
                  className={`${BUTTON_BASE} font-bold ${TONE[item.primaryTone].primary}`}
                  onClick={e => {
                    e.stopPropagation()
                    const inPlace = item.primary!.inPlace
                    if (inPlace && onOpenInPlace) onOpenInPlace(inPlace)
                    else go(item.primary!.href)
                  }}
                >
                  {item.primary.label}
                </Button>
              )}
              {secondary}
            </div>
          </div>
        </div>
      )}
      {item.compact && <div className="sm:hidden px-3 pb-3 -mt-1 flex">{secondary}</div>}
      {schedule}
    </div>
  )
}

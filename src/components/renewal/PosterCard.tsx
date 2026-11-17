import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { formatJstMonthDay, formatJstWeekday } from '@/utils/jstDate'
import { ScenarioCardImage } from '@/components/public-top/ScenarioCardImage'

export interface PosterEvent {
  date: string
  start_time?: string | null
  store_name: string
  /** 右端の残席（「● あと1席」など） */
  seats?: ReactNode
}

interface PosterCardProps {
  title: string
  imageUrl: string | null
  /** 画像の下、作品名の上の小さな行（「12/5 公演開始」「あと1人で成立」） */
  label?: ReactNode
  /** 組織・店舗の行 */
  place?: ReactNode
  /** 人数・時間などの行 */
  meta?: ReactNode
  event?: PosterEvent | null
  /** 公演の行の下（「ほか2回」など） */
  footer?: ReactNode
  /** 画像の縦横（縦長のポスター＝新作・成立間近、横長＝探すの結果） */
  shape?: 'poster' | 'wide'
  dark?: boolean
  className?: string
  onOpen: () => void
  testId?: string
}

/**
 * 作品のカード（刷新版）。画像を大きく、その下に日付や成立までの人数 → 組織・店舗 → 作品名 → 人数・時間 → 次の公演。
 * カード全体が押せる（作品ページへ）。
 */
export function PosterCard({ title, imageUrl, label, place, meta, event, footer, shape = 'poster', dark, className, onOpen, testId }: PosterCardProps) {
  return (
    <div
      role="link"
      tabIndex={0}
      aria-label={title}
      data-testid={testId}
      className={cn('group min-w-0 cursor-pointer text-left', className)}
      onClick={onOpen}
      onKeyDown={(e) => { if (e.key === 'Enter') onOpen() }}
    >
      <div className={cn('relative w-full overflow-hidden', shape === 'poster' ? 'aspect-[4/5]' : 'aspect-[16/9]')}>
        <ScenarioCardImage src={imageUrl} alt={title} className="transition-transform duration-300 group-hover:scale-[1.02]" />
      </div>
      <div className="pt-2.5">
        {label && <p className={cn('text-xs font-bold', dark ? 'text-white/70' : 'text-foreground')}>{label}</p>}
        {place && <p className={cn('mt-0.5 truncate text-xs', dark ? 'text-white/60' : 'text-muted-foreground')}>{place}</p>}
        <h3 className={cn('mt-1 line-clamp-2 text-base font-bold leading-snug', dark ? 'font-serif text-lg' : '')}>{title}</h3>
        {meta && <p className={cn('mt-1 truncate text-xs', dark ? 'text-white/60' : 'text-muted-foreground')}>{meta}</p>}
        {event && (
          <div className={cn('mt-2.5 border-t pt-2.5', dark ? 'border-white/15' : 'border-gray-200')}>
            <div className="flex items-baseline gap-3 text-sm">
              <span className="shrink-0 font-bold">{formatJstMonthDay(event.date)} {formatJstWeekday(event.date)}</span>
              {event.start_time && <span className="shrink-0">{event.start_time.slice(0, 5)}</span>}
              <span className={cn('min-w-0 truncate', dark ? 'text-white/60' : 'text-muted-foreground')}>{event.store_name}</span>
              {event.seats && <span className="ml-auto shrink-0 text-xs font-bold">{event.seats}</span>}
            </div>
          </div>
        )}
        {footer && <div className={cn('mt-2 border-t pt-2 text-xs', dark ? 'border-white/15 text-white/60' : 'border-gray-200 text-muted-foreground')}>{footer}</div>}
      </div>
    </div>
  )
}

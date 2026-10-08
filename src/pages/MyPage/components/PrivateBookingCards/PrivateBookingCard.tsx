import type { ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { Check, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { PrivateBookingItem, PrivateBookingSection } from './privateBookingModel'

/** 節ごとの色（要対応＝紫・返事待ち＝琥珀・確定＝緑・終了＝灰） */
const TONE: Record<PrivateBookingSection, { card: string; header: string; step: string; stepRing: string; primary: string }> = {
  action: {
    card: 'border-purple-200 hover:border-purple-300',
    header: 'bg-purple-100 text-purple-900',
    step: 'bg-purple-600 text-white',
    stepRing: 'border-purple-600 text-purple-700',
    primary: 'bg-purple-600 hover:bg-purple-700 text-white',
  },
  waiting_store: {
    card: 'border-amber-200 hover:border-amber-300',
    header: 'bg-amber-100 text-amber-900',
    step: 'bg-amber-500 text-white',
    stepRing: 'border-amber-500 text-amber-700',
    primary: 'bg-amber-600 hover:bg-amber-700 text-white',
  },
  waiting_organizer: {
    card: 'border-amber-200 hover:border-amber-300',
    header: 'bg-amber-50 text-amber-900',
    step: 'bg-amber-500 text-white',
    stepRing: 'border-amber-500 text-amber-700',
    primary: 'bg-amber-600 hover:bg-amber-700 text-white',
  },
  confirmed: {
    card: 'border-green-200 hover:border-green-300',
    header: 'bg-green-100 text-green-900',
    step: 'bg-green-600 text-white',
    stepRing: 'border-green-600 text-green-700',
    primary: 'bg-green-600 hover:bg-green-700 text-white',
  },
  ended: {
    card: 'border-border',
    header: 'bg-muted text-muted-foreground',
    step: 'bg-muted-foreground text-white',
    stepRing: 'border-muted-foreground text-muted-foreground',
    primary: '',
  },
}

function ProgressSteps({ item }: { item: PrivateBookingItem }) {
  const tone = TONE[item.section]
  const { steps, current } = item.progress
  const currentLabel = current < steps.length ? steps[current] : '完了'
  return (
    <ol className="flex items-start mt-2" aria-label={`進み具合: ${currentLabel}`}>
      {steps.map((step, i) => {
        const done = i < current
        const isCurrent = i === current
        return (
          <li key={step} className="flex-1 min-w-0 flex flex-col items-center relative">
            {i > 0 && (
              <span
                aria-hidden="true"
                className={`absolute top-2 right-1/2 w-full h-px ${done || isCurrent ? 'bg-current opacity-40' : 'bg-border'}`}
              />
            )}
            <span
              aria-hidden="true"
              className={`relative z-[1] w-4 h-4 rounded-full flex items-center justify-center border ${
                done ? `${tone.step} border-transparent` : isCurrent ? `bg-background ${tone.stepRing} border-2` : 'bg-background border-border'
              }`}
            >
              {done && <Check className="w-2.5 h-2.5" />}
            </span>
            <span
              className={`mt-1 text-xs whitespace-nowrap ${isCurrent ? 'font-bold text-foreground' : 'text-muted-foreground'}`}
              aria-current={isCurrent ? 'step' : undefined}
            >
              {step}
            </span>
          </li>
        )
      })}
    </ol>
  )
}

interface PrivateBookingCardProps {
  item: PrivateBookingItem
  /** カード右上の「操作」ボタン（PrivateBookingCardActions） */
  actions?: ReactNode
  /** 副ボタンの差し替え（主催者の引き継ぎの「引き継がない」など） */
  secondaryAction?: ReactNode
}

/** 1 貸切 = 1 カード。ヘッダー左に「次にやること」、右に主催者 */
export function PrivateBookingCard({ item, actions, secondaryAction }: PrivateBookingCardProps) {
  const navigate = useNavigate()
  const tone = TONE[item.section]
  const go = (href: string) => navigate(href)
  return (
    <div
      role="link"
      tabIndex={0}
      aria-label={`${item.title}（${item.label}）を開く`}
      data-testid="private-booking-card"
      data-section={item.section}
      className={`bg-card border ${tone.card} hover:shadow-md transition-all cursor-pointer rounded-none focus:outline-none focus-visible:ring-2 focus-visible:ring-ring`}
      onClick={() => go(item.href)}
      onKeyDown={e => {
        if (e.target !== e.currentTarget) return
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          go(item.href)
        }
      }}
    >
      <div className={`px-3 py-1.5 flex items-center justify-between gap-2 ${tone.header}`}>
        <span className="min-w-0 text-sm font-bold" data-testid="private-booking-label">{item.label}</span>
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-xs">{item.hostLabel}</span>
          {actions && <div onClick={e => e.stopPropagation()}>{actions}</div>}
        </div>
      </div>

      <div className="p-3 flex gap-3">
        <div className="w-16 h-24 flex-shrink-0 bg-foreground relative overflow-hidden rounded-none">
          {item.imageUrl ? (
            <>
              <div
                aria-hidden="true"
                className="absolute inset-0 scale-110"
                style={{
                  backgroundImage: `url(${item.imageUrl})`,
                  backgroundSize: 'cover',
                  backgroundPosition: 'center',
                  filter: 'blur(8px) brightness(0.6)',
                }}
              />
              <img src={item.imageUrl} alt="" className="relative w-full h-full object-contain" loading="lazy" />
            </>
          ) : (
            <div className="w-full h-full flex items-center justify-center" aria-hidden="true">
              <span className="text-xl opacity-40">🎭</span>
            </div>
          )}
        </div>

        <div className="flex-1 min-w-0">
          <h3 className="font-bold text-foreground text-sm leading-tight line-clamp-2">{item.title}</h3>
          <ProgressSteps item={item} />
          <p className="mt-2 text-xs text-muted-foreground leading-snug" data-testid="private-booking-description">{item.description}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {item.primary && (
              <Button
                type="button"
                size="sm"
                className={`h-8 text-xs rounded-none ${tone.primary}`}
                onClick={e => {
                  e.stopPropagation()
                  go(item.primary!.href)
                }}
              >
                {item.primary.label}
              </Button>
            )}
            {secondaryAction ?? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-8 text-xs rounded-none"
                onClick={e => {
                  e.stopPropagation()
                  go(item.secondary.href)
                }}
              >
                {item.secondary.label}
              </Button>
            )}
          </div>
        </div>

        <div className="hidden sm:flex items-center" aria-hidden="true">
          <ChevronRight className="w-5 h-5 text-muted-foreground" />
        </div>
      </div>
    </div>
  )
}

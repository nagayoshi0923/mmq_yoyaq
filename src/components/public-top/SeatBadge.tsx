import { seatState, type PublicPerformance } from '@/lib/publicPerformanceSearch'
import { cn } from '@/lib/utils'

const KIND_CLASS = {
  available: 'bg-emerald-50 text-emerald-700',
  few: 'bg-red-50 text-red-700',
  nearly_confirmed: 'bg-red-50 text-red-700',
  full: 'bg-muted text-muted-foreground',
} as const

/** 残 N／残 N・成立間近／満席・キャンセル待ち */
export function SeatBadge({ performance, className }: { performance: Pick<PublicPerformance, 'available_seats' | 'current_participants' | 'player_count_min'>; className?: string }) {
  const state = seatState(performance)
  return (
    <span className={cn('inline-block rounded-full px-2 py-0.5 text-xs font-medium', KIND_CLASS[state.kind], className)}>
      {state.label}
    </span>
  )
}

export function SoftTag({ children, className }: { children: React.ReactNode; className?: string }) {
  return <span className={cn('inline-block rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground', className)}>{children}</span>
}

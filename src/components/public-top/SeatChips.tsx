import { cn } from '@/lib/utils'
import { isConfirmed, type SeatFields } from './scenarioCards'

/**
 * 作品カード（本番 main の ScenarioCard の見た目）の残席チップ（判定は scenarioCards.ts）。
 * トップページの作品カードはすべてこれを使う（2026-10-12・10-13 社長指示）。
 */

/** 「開催決定」と「残N／満席」の角なしチップ（文字の大きさは本番と同じ 10px の ts-10） */
export function SeatChips({ performance, className }: { performance: SeatFields; className?: string }) {
  const seats = performance.available_seats
  const seatClass = seats <= 0
    ? 'bg-booking-seat-full-bg text-booking-seat-full-text'
    : seats <= 2
      ? 'bg-booking-seat-low-bg text-booking-seat-low-text'
      : 'bg-booking-accent-light text-booking-accent'
  return (
    <div className={cn('flex items-center gap-1', className)}>
      {isConfirmed(performance) && (
        <span className="ts-10 font-bold px-1.5 py-0.5 bg-booking-confirmed-bg text-booking-confirmed-text rounded-none">開催決定</span>
      )}
      <span className={cn('ts-10 font-bold px-1.5 py-0.5 rounded-none', seatClass)}>{seats <= 0 ? '満席' : `残${seats}`}</span>
    </div>
  )
}

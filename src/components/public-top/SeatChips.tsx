import { cn } from '@/lib/utils'
import { isConfirmed, type SeatFields } from './scenarioCards'

/**
 * 作品カード（本番 main の ScenarioCard の見た目）の残席チップ（判定は scenarioCards.ts）。
 * トップページの作品カードはすべてこれを使う（2026-10-12・10-13 社長指示）。
 */

/** 「開催決定」と「残N／満席」の角なしチップ（文字の大きさは本番と同じ 10px の ts-10）。狭い作品カードの中では見本 Top.dc.html の色（残2以下 #b91c1c、残あり #dcfce7/#15803d） */
export function SeatChips({ performance, className }: { performance: SeatFields; className?: string }) {
  const seats = performance.available_seats
  const seatClass = seats <= 0
    ? 'bg-booking-seat-full-bg text-booking-seat-full-text'
    : seats <= 2
      ? 'bg-booking-seat-low-bg text-booking-seat-low-text card-narrow:text-red-700'
      : 'bg-booking-accent-light text-booking-accent card-narrow:bg-green-100 card-narrow:text-green-700'
  return (
    <div className={cn('flex items-center gap-1 card-narrow:gap-0.5', className)}>
      {isConfirmed(performance) && (
        <span className="ts-10 font-bold px-1.5 py-0.5 card-narrow:px-[5px] bg-booking-confirmed-bg text-booking-confirmed-text rounded-none">開催決定</span>
      )}
      <span className={cn('ts-10 font-bold px-1.5 py-0.5 card-narrow:px-[5px] rounded-none', seatClass)}>{seats <= 0 ? '満席' : `残${seats}`}</span>
    </div>
  )
}

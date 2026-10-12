import type { PublicPerformance } from '@/lib/publicPerformanceSearch'
import { cn } from '@/lib/utils'

type SeatFields = Pick<PublicPerformance, 'available_seats' | 'current_participants' | 'player_count_min'>

/**
 * 「残りわずか」の帯のカード用。本番（main）の作品カード ScenarioCard と同じ見た目・言い方にする
 * （2026-10-12 社長指示）。他の場所の残席表示は SeatBadge のまま。
 */

/** 成立間近: 最低人数まで残り 1〜しきい値（最低人数 4 以下なら 2、5 以上なら 3）。本番の作品カードと同じ判定 */
export function isNearlyConfirmed(p: SeatFields): boolean {
  if (p.available_seats <= 0) return false
  const remaining = p.player_count_min - p.current_participants
  const threshold = p.player_count_min <= 4 ? 2 : 3
  return remaining >= 1 && remaining <= threshold
}

/** 開催決定: 最低人数に達していて満席でない */
export function isConfirmed(p: SeatFields): boolean {
  return p.player_count_min > 0 && p.current_participants >= p.player_count_min && p.available_seats > 0
}

/** 画像の左下に重ねる「成立間近！」の帯（条件を満たさないときは何も出さない）。親に relative が要る */
export function NearlyConfirmedRibbon({ performance }: { performance: SeatFields }) {
  if (!isNearlyConfirmed(performance)) return null
  return <div className="absolute bottom-0 left-0 px-3 py-1 text-xs font-bold text-white bg-booking-danger">成立間近！</div>
}

/** 「開催決定」と「残N／満席」の角なしチップ（文字の大きさは本番と同じ 10px の ts-10） */
export function NearlyFullSeatChips({ performance, className }: { performance: SeatFields; className?: string }) {
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

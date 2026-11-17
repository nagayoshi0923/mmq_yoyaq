import { formatJstMonthDay } from '@/utils/jstDate'
import { seatState, type PublicPerformance } from '@/lib/publicPerformanceSearch'
import type { NewArrivalDate } from '@/components/public-top/newArrivals'

/** 新作の日付の言い方（リリース日は「12/5 公演開始」、掲載登録日しか無いときは「12/5 掲載」） */
export function newArrivalLabel(date: NewArrivalDate): string {
  return `${formatJstMonthDay(date.date)} ${date.kind === 'release' ? '公演開始' : '掲載'}`
}

/** 成立間近の言い方（あと N 人で成立／残り N 席） */
export function nearlyFullLabel(p: PublicPerformance): string {
  const need = p.player_count_min - p.current_participants
  if (seatState(p).kind === 'nearly_confirmed' && need > 0) return `あと${need}人で成立`
  return `残り${p.available_seats}席`
}

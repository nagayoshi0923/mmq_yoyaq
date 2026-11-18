import type { ReactNode } from 'react'
import { createElement } from 'react'
import { seatToneClass } from './labels'
import { formatJstMonthDay } from '@/utils/jstDate'
import { seatState, type PublicPerformance } from '@/lib/publicPerformanceSearch'
import type { NewArrivalDate } from '@/components/public-top/newArrivals'

/**
 * 新作の日付の言い方。公演開始日（作品マスタのリリース日）が分かっているときだけ「12/5 公演開始」と出す。
 * 公演開始日が未発表（掲載登録日しか無い）作品は日付を出さない（2026-11-18 えいきち「日付は出さないでいこう いまは」。
 * 掲載日や貸切予約開始日を公演開始日と取り違えさせないため）。並び・新作の判定は従来どおり掲載登録日も使う。
 */
export function newArrivalLabel(date: NewArrivalDate): string | null {
  return date.kind === 'release' ? `${formatJstMonthDay(date.date)} 公演開始` : null
}

/** 成立間近の言い方（あと N 人で成立／残り N 席） */
export function nearlyFullLabel(p: PublicPerformance): ReactNode {
  const need = p.player_count_min - p.current_participants
  if (seatState(p).kind === 'nearly_confirmed' && need > 0) return `あと${need}人で成立`
  // 残席は「あと N 席」と同じ色の段階（labels.tsx の seatTone）
  return createElement('span', { className: seatToneClass(p.available_seats) }, `残り${p.available_seats}席`)
}

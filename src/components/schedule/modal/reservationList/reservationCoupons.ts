/**
 * 予約に付いたクーポンの「来店確認済み／未確認」（スタッフ側。社長決定 B、2026-10-20）。
 * クーポンは予約時に使用済み。お客様が来店時にマイページで「もぎる」を押すと来店確認済みになる。
 */
import type { ReservationCouponStatus } from '@/lib/api/couponApi'
import { formatJstDateTime } from '@/utils/jstDate'

/** 予約IDごとにまとめる */
export function groupCouponStatusesByReservation(rows: readonly ReservationCouponStatus[] | undefined): Map<string, ReservationCouponStatus[]> {
  const map = new Map<string, ReservationCouponStatus[]>()
  for (const row of rows ?? []) {
    const list = map.get(row.reservation_id) ?? []
    list.push(row)
    map.set(row.reservation_id, list)
  }
  return map
}

/** 行に出す短い表示（例「クーポン 来店確認済み」「クーポン 未確認」） */
export function couponBadge(statuses: readonly ReservationCouponStatus[] | undefined): { label: string; redeemed: boolean } | null {
  if (!statuses || statuses.length === 0) return null
  const redeemed = statuses.every(status => !!status.redeemed_at)
  return { label: redeemed ? 'クーポン 来店確認済み' : 'クーポン 未確認', redeemed }
}

/** 予約台帳に出す詳細（例「初回クーポン ¥500 割引・来店確認済み（2026/10/20 13:05）」） */
export function couponDetail(status: ReservationCouponStatus): string {
  const name = status.campaign_name || 'クーポン'
  const amount = `¥${Number(status.discount_amount || 0).toLocaleString()} 割引`
  const state = status.redeemed_at
    ? `来店確認済み（${formatJstDateTime(status.redeemed_at)}${status.redeemed_source === 'venue_use' ? '・来店時に使用' : ''}）`
    : '来店確認は未確認（予約時に適用）'
  return `${name} ${amount}・${state}`
}

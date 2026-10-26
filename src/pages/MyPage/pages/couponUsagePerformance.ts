import type { CustomerCouponUsageWithReservation } from '@/types/coupon'
import { formatJstDateJa, formatJstTime } from '@/utils/jstDate'

function cleanScenarioTitleForCoupon(title?: string | null): string {
  if (!title) return '（タイトル不明）'
  const t = title
    .replace(/【貸切希望】/g, '【貸切】')
    .replace(/（候補\d+件）/g, '')
    .trim()
  return t || '（タイトル不明）'
}

/**
 * 使用履歴の公演（作品 ｜ 店舗 ｜ 日時）。日時は公演の日付・開始時刻を正とし、無ければ予約の日時を日本時間で出す
 * （2026-10-26 点検 F13: UTC の 04:00+00 をそのまま 04:00 と出していた。適用済みの欄は 13:00）。
 */
export function formatCouponUsagePerformance(usage: CustomerCouponUsageWithReservation): string {
  const res = usage.reservations
  if (!res) {
    return '公演情報を表示できません（予約が削除された場合など）'
  }
  const name = cleanScenarioTitleForCoupon(res.title)
  const store = res.stores?.short_name || res.stores?.name || ''
  let when = ''
  if (res.performance_date) {
    const datePart = formatJstDateJa(res.performance_date)
    const timePart = res.performance_start_time?.slice(0, 5) ?? ''
    when = timePart ? `${datePart} ${timePart}〜` : datePart
  } else if (res.requested_datetime) {
    // 時差が「+00」だけの形（DB の表記）も読めるように「+00:00」にそろえる。時差の無い日時は日本時間の壁時計（jstDate の規則）
    const dt = res.requested_datetime.replace(/([+-]\d{2})$/, '$1:00')
    const datePart = formatJstDateJa(dt)
    const timePart = formatJstTime(dt)
    when = timePart ? `${datePart} ${timePart}〜` : datePart
  }
  const parts = [name, store, when].filter(Boolean)
  return parts.join(' ｜ ')
}

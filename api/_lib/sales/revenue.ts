// 売上の規則（金額の正本は final_price、#721）。api/sales.ts から切り出した（整備 Phase 3、#774）。挙動は変えない。
import type { ReservationRow } from './types.js'

const ADMIN_ENTERED_REVENUE_SOURCES = new Set(['walk_in', 'demo', 'demo_auto'])
// 売上に数える予約状態。顧客一覧（get_org_customers_with_stats_v2）と同じ。pending は含めない（#721）。
export const SALES_RESERVATION_STATUSES = ['confirmed', 'gm_confirmed', 'checked_in']

export function getReservationRevenue(
  reservation: Pick<ReservationRow, 'reservation_source' | 'unit_price' | 'total_price' | 'final_price' | 'discount_amount'>,
  participantCount: number,
  scenarioUnitFee: number,
): number {
  // 金額の正本は final_price（確定金額、クーポン控除後）。#721（2026-10-02 社長判断）。
  // 旧貸切の「合計だけ保存・final_price 0」は migration 20261002160000 で final_price に揃えた。
  if (reservation.final_price != null && reservation.final_price >= 0) return reservation.final_price
  // final_price が無い予約だけフォールバック: 当日受付・demo は単価 × 人数、それ以外は合計、無ければ参加費 × 人数
  if (ADMIN_ENTERED_REVENUE_SOURCES.has(reservation.reservation_source || '')) {
    const unitPrice = reservation.unit_price && reservation.unit_price > 0 ? reservation.unit_price : scenarioUnitFee
    return unitPrice * participantCount
  }
  if (reservation.total_price && reservation.total_price > 0) return reservation.total_price
  return scenarioUnitFee * participantCount
}

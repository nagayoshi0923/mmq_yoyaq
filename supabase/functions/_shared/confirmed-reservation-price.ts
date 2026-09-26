/** 予約確定後の案内はDB保存額だけを使用し、0円も保持する。 */
export function confirmedReservationPrice(reservation: { final_price?: number | null; total_price?: number | null; discount_amount?: number | null }): number {
  const price = reservation.final_price ?? (reservation.total_price == null ? NaN : reservation.total_price - (reservation.discount_amount ?? 0))
  if (typeof price !== 'number' || !Number.isFinite(price) || price < 0) throw new Error('予約の確定金額を確認できません')
  return price
}

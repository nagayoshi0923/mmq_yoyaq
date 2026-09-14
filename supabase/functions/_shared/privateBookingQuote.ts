/** Display server-saved candidate totals; never derive billing from email request values. */
export function formatPrivateBookingQuoteTotal(total: number, candidates: unknown): string {
  const totals = Array.isArray(candidates)
    ? candidates.map(c => c?.totalPrice).filter((v): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0)
    : []
  const min = totals.length ? Math.min(...totals) : total
  const max = totals.length ? Math.max(...totals) : total
  return min === max ? min.toLocaleString('ja-JP') : `${min.toLocaleString('ja-JP')}〜${max.toLocaleString('ja-JP')}`
}

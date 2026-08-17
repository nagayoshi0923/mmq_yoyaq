/** 対象月の末日 23:59:59 JST より後に送られた報告は事後報告。 */
export function isLatePartnerReport(year: number, month: number, submittedAt: string | null | undefined): boolean {
  if (!submittedAt) return false
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate()
  const monthEnd = new Date(
    `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}T23:59:59.999+09:00`
  )
  const submitted = new Date(submittedAt)
  if (Number.isNaN(submitted.getTime())) return false
  return submitted.getTime() > monthEnd.getTime()
}

export function daysAgoIso(days: number): string {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()
}

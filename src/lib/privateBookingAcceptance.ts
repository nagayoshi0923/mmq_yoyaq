/**
 * 作品が顧客側の貸切リクエストを受け付けるか判定する。
 * undefined は後方互換のため受付中扱い（DB 既定値 true / regular に合わせる）。
 */
export function isScenarioAcceptingPrivateBooking(scenario: {
  accepts_private_booking?: boolean | null
  scenario_kind?: string | null
}): boolean {
  if (scenario.accepts_private_booking === false) return false
  if (scenario.scenario_kind === 'offsite_only') return false
  return true
}

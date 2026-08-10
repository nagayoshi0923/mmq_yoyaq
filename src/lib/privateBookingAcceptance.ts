export type PrivateBookingAcceptanceInput = {
  accepts_private_booking?: boolean | null
  scenario_kind?: string | null
}

/** 顧客向け貸切リクエストを受け付ける作品か（OFF / 出張限定は不可） */
export function isScenarioAcceptingPrivateBooking(
  scenario: PrivateBookingAcceptanceInput | null | undefined,
): boolean {
  if (!scenario) return false
  if (scenario.accepts_private_booking === false) return false
  if (scenario.scenario_kind === 'offsite_only') return false
  return true
}

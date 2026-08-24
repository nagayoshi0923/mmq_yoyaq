/** 土日祝の夜枠開始を 19:30 にする貸切シナリオ（店舗実運用に合わせる） */
export const WEEKEND_EVENING_PRIVATE_BOOKING_START_MINUTES = 19 * 60 + 30

const WEEKEND_EVENING_1930_TITLE_SUBSTRINGS = [
  '戦塵のレガストリア',
  'BeatSpecter',
] as const

export function usesWeekendEvening1930PrivateBookingStart(
  scenarioTitle?: string | null
): boolean {
  const t = (scenarioTitle || '').trim()
  if (!t) return false
  return WEEKEND_EVENING_1930_TITLE_SUBSTRINGS.some((s) => t.includes(s))
}

export function getWeekendEveningStartFloorMinutes(
  isWeekendOrHoliday: boolean,
  scenarioTitle?: string | null
): number | null {
  if (!isWeekendOrHoliday) return null
  if (!usesWeekendEvening1930PrivateBookingStart(scenarioTitle)) return null
  return WEEKEND_EVENING_PRIVATE_BOOKING_START_MINUTES
}

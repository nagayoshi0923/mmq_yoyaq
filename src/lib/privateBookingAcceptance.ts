import type { StoreRecruitmentPausePeriod } from './storeRecruitmentPause'

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

/** 作品の「貸切募集期間」（作品編集 › 基本情報。organization_scenarios.booking_start_date / booking_end_date） */
export type PrivateBookingPeriodInput = {
  booking_start_date?: string | null
  booking_end_date?: string | null
}

/**
 * 今日が貸切募集期間の中か（未設定は制限なし）。
 * DB の assert_private_booking_candidate_date（理由 not_recruiting / P0044）と同じ「今日」との比較。
 * 貸切を始めるページ（PrivateBookingStart）の「受付期間外」もこれで決める。
 */
export function isPrivateBookingPeriodOpen(scenario: PrivateBookingPeriodInput, todayJst: string): boolean {
  if (scenario.booking_start_date && todayJst < scenario.booking_start_date.slice(0, 10)) return false
  if (scenario.booking_end_date && todayJst > scenario.booking_end_date.slice(0, 10)) return false
  return true
}

/**
 * 作品単位の貸切の受付状況（公演日に関係なく「貸切リクエスト（日程相談）を始められるか」）。空き枠の保証ではない。
 * - accepting: 貸切受付 ON・出張限定でない（グループ作成 create_private_group_atomic と同じ）、
 *   今日が貸切募集期間の中（not_recruiting にならない）、公演期間が終わっていない（今日以降の日付がすべて outside_period にならない）
 * - not_accepting: 貸切受付 OFF（貸切休止中）または出張限定
 * - closed: 貸切募集期間の外、または公演期間が終わった
 * - paused: 上演できる店舗がすべて、受付対象期間の公演日をすべて貸切の募集停止期間（I6）で覆われている（privateBookingStoreStatus）
 * - no_store: 上演できる店舗が無い（no_store_for_scenario）
 * - no_dates: 受付対象期間（締切〜受付範囲〜公演期間）に公演日が 1 日も無い（privateBookingDateWindow）
 * - unknown: 判定に要る値を読めていない・列が欠けている（「受付中」とは出さない）
 * 新しい規則は足さない。日付ごとの可否（締切・受付範囲・空き）は日程を選ぶときに DB が決める。
 */
export type PrivateBookingStatus = 'accepting' | 'not_accepting' | 'closed' | 'paused' | 'no_store' | 'no_dates' | 'unknown'

export type PrivateBookingStatusInput = PrivateBookingAcceptanceInput & PrivateBookingPeriodInput & {
  /** 作品の公演期間の終わり（organization_scenarios.available_until）。読めていなければ undefined を渡す */
  available_until?: string | null
}

/** 判定に要る列（undefined＝取得していない・応答に無い。null＝未設定＝制限なし とは区別する） */
const REQUIRED_KEYS = ['accepts_private_booking', 'scenario_kind', 'booking_start_date', 'booking_end_date', 'available_until'] as const

export function privateBookingStatus(
  scenario: PrivateBookingStatusInput | null | undefined,
  todayJst: string,
): PrivateBookingStatus {
  if (!scenario) return 'unknown'
  if (REQUIRED_KEYS.some((k) => scenario[k] === undefined)) return 'unknown'
  if (!isScenarioAcceptingPrivateBooking(scenario)) return 'not_accepting'
  if (!isPrivateBookingPeriodOpen(scenario, todayJst)) return 'closed'
  if (scenario.available_until && scenario.available_until.slice(0, 10) < todayJst) return 'closed'
  return 'accepting'
}

/** 申し込める公演日の範囲（両端を含む YYYY-MM-DD） */
export interface PrivateBookingDateWindow {
  from: string
  to: string
}

/** YYYY-MM-DD の暦日加算 */
function addDays(ymd: string, days: number): string {
  const [y, m, d] = ymd.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d + days))
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`
}

/**
 * 申し込める公演日の範囲（受付対象期間）。DB の assert_private_booking_candidate_date と同じ日付の条件だけを使う:
 * - 受付締切（I14）: 公演日 < 今日 + 締切日数 は past_deadline → 最初の日は 今日 + 締切日数
 * - 受付範囲（I21）: 公演日 > 今日 + 範囲日数 は too_far → 最後の日は 今日 + 範囲日数
 * - 公演期間（I13）: available_from より前・available_until より後は outside_period
 * 範囲が空なら null（どの日も申し込めない）。貸切募集期間（booking_*）は公演日ではなく今日で比べるので privateBookingStatus 側。
 */
export function privateBookingDateWindow(input: {
  todayJst: string
  deadlineDays: number
  horizonDays: number
  available_from: string | null
  available_until: string | null
}): PrivateBookingDateWindow | null {
  let from = addDays(input.todayJst, input.deadlineDays)
  let to = addDays(input.todayJst, input.horizonDays)
  if (input.available_from && input.available_from.slice(0, 10) > from) from = input.available_from.slice(0, 10)
  if (input.available_until && input.available_until.slice(0, 10) < to) to = input.available_until.slice(0, 10)
  return from <= to ? { from, to } : null
}

/**
 * ある店舗の貸切の募集停止期間（I6）が、範囲の公演日をすべて覆うか。
 * 停止の読み方は DB（private_booking_candidate_slot_availability: p_date BETWEEN coalesce(starts_on,p_date) AND coalesce(ends_on,p_date)）と
 * 画面（storeRecruitmentPause.isDateInRecruitmentPause）と同じ: 開始日・終了日を含み、空の端は無期限。
 */
function pausesCoverWindow(storeId: string, pauses: readonly StoreRecruitmentPausePeriod[], window: PrivateBookingDateWindow): boolean {
  const spans = pauses
    .filter((p) => p.store_id === storeId && p.pause_type === 'private')
    .map((p) => ({ start: p.starts_on ?? '0000-01-01', end: p.ends_on ?? '9999-12-31' }))
    .sort((a, b) => a.start.localeCompare(b.start))
  let cursor = window.from // まだ覆われていない最初の日
  for (const span of spans) {
    if (span.end < cursor) continue
    if (span.start > cursor) return false
    if (span.end >= window.to) return true
    cursor = addDays(span.end, 1)
  }
  return false
}

/**
 * 店舗の貸切の募集停止（I6。store_recruitment_pauses の pause_type='private'）で見た受付状況。
 * 停止は公演日で判定する（DB と同じ）。上演できる店舗（isStorePlayableForScenario で絞った店舗）のうち、
 * 受付対象期間の公演日に停止していない日が 1 日でも残る店舗があれば open。
 * すべての店舗が受付対象期間をすべて停止で覆われていれば paused、上演できる店舗が無ければ no_store、
 * 受付対象期間が空なら no_dates、停止期間を読めていなければ（pauses が null）unknown。
 */
export function privateBookingStoreStatus(
  playableStoreIds: readonly string[],
  pauses: readonly StoreRecruitmentPausePeriod[] | null | undefined,
  window: PrivateBookingDateWindow | null,
): 'open' | 'paused' | 'no_store' | 'no_dates' | 'unknown' {
  if (!pauses) return 'unknown'
  if (playableStoreIds.length === 0) return 'no_store'
  if (!window) return 'no_dates'
  return playableStoreIds.some((id) => !pausesCoverWindow(id, pauses, window)) ? 'open' : 'paused'
}

/**
 * 作品の受付状況と店舗の募集停止・受付対象期間を合わせた最終の状況
 * （トップ・作品ページの「貸切受付中」はこれが accepting のときだけ）。
 * window が undefined（締切・受付範囲の日数を読めていない）なら unknown。
 */
export function privateBookingStatusWithStores(
  scenario: PrivateBookingStatusInput | null | undefined,
  playableStoreIds: readonly string[] | null,
  pauses: readonly StoreRecruitmentPausePeriod[] | null | undefined,
  window: PrivateBookingDateWindow | null | undefined,
  todayJst: string,
): PrivateBookingStatus {
  const base = privateBookingStatus(scenario, todayJst)
  if (base !== 'accepting') return base
  if (playableStoreIds === null || window === undefined) return 'unknown'
  const store = privateBookingStoreStatus(playableStoreIds, pauses, window)
  return store === 'open' ? 'accepting' : store
}

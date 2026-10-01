/** 固定staging fixtureの外部通知だけを止める。任意組織の停止設定ではない。 */
const STAGING_ORIGIN = 'https://lavutzztfqbdndjiwluc.supabase.co'
const PRODUCTION_ORIGIN = 'https://cznpcewciwywcqcxktba.supabase.co'
const QA_ORGANIZATION = 'bda7cbb7-0d58-4e5c-ab4a-b45d09afdb3e'
const QA_SLUG = 'mmq-qa-20261001-e9a3353f'
const QA_EVENT = 'ade5cca7-317a-49a3-865a-a8a2fbc046ec'
const QA_STORE = '486e6f7d-e319-47d9-ad21-52d2ad5b654f'
const QA_SCENARIO_MASTER = 'e1b1c080-8d1a-45b5-ac24-378993c57630'
const QA_ORGANIZATION_SCENARIO = '050a9f0d-128f-4d73-ac65-4f5ec3074f0e'
const QA_CUSTOMER = '57d39609-5c18-408c-95af-a407f3a37a53'
const QA_USER = '05032480-0349-49f3-bdc2-6cddb245796d'
const QA_EMAIL = 'qa-customer-a-20261001@example.invalid'

interface ReadQuery {
  select(columns: string): ReadQuery
  eq(column: string, value: string): ReadQuery
  maybeSingle(): PromiseLike<{ data: Record<string, unknown> | null; error: unknown }>
}
interface ReadClient { from(table: string): ReadQuery }
export interface StoredQaReservation {
  organization_id?: unknown
  customer_id?: unknown
  customer_email?: unknown
  schedule_event_id?: unknown
  store_id?: unknown
  scenario_master_id?: unknown
  private_group_id?: unknown
  candidate_datetimes?: unknown
  reservation_source?: unknown
  payment_status?: unknown
  coupon_usage_id?: unknown
}
export type QaBookingNotificationDecision =
  | { kind: 'not_applicable' }
  | { kind: 'suppressed'; reason: 'qa_notification_suppressed' }
  | { kind: 'blocked'; reason: 'qa_environment_unverified' | 'qa_fixture_unverified' }

/** reservationは各EdgeがDBから読み、既存の予約・メール・組織検証を済ませた行。 */
export async function checkQaBookingNotificationGuard(
  db: ReadClient,
  reservation: StoredQaReservation,
  supabaseUrl: string | undefined,
): Promise<QaBookingNotificationDecision> {
  // 通常業務には追加SELECTも通知設定の読み替えも行わない。
  if (reservation.organization_id !== QA_ORGANIZATION) return { kind: 'not_applicable' }
  let origin: string
  try {
    const url = new URL(supabaseUrl ?? '')
    if (url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
      return { kind: 'blocked', reason: 'qa_environment_unverified' }
    }
    origin = url.origin
  } catch { return { kind: 'blocked', reason: 'qa_environment_unverified' } }
  // 本番にこの資料候補が混ざっても、固定QAの抑止を本番へ適用しない。
  if (origin === PRODUCTION_ORIGIN) return { kind: 'not_applicable' }
  if (origin !== STAGING_ORIGIN) return { kind: 'blocked', reason: 'qa_environment_unverified' }

  const blocked: QaBookingNotificationDecision = { kind: 'blocked', reason: 'qa_fixture_unverified' }
  if (reservation.customer_id !== QA_CUSTOMER || reservation.customer_email !== QA_EMAIL
    || reservation.schedule_event_id !== QA_EVENT || reservation.store_id !== QA_STORE
    || reservation.scenario_master_id === undefined
    || (reservation.scenario_master_id !== null && reservation.scenario_master_id !== QA_SCENARIO_MASTER)
    || reservation.private_group_id !== null || reservation.candidate_datetimes !== null
    || reservation.reservation_source !== 'web' || reservation.payment_status !== 'pending'
    || reservation.coupon_usage_id !== null) return blocked

  try {
    const organization = await db.from('organizations').select('id,slug').eq('id', QA_ORGANIZATION).maybeSingle()
    if (organization.error || organization.data?.id !== QA_ORGANIZATION || organization.data.slug !== QA_SLUG) return blocked
    const event = await db.from('schedule_events')
      .select('id,organization_id,store_id,scenario_master_id,organization_scenario_id,category,is_private_booking,is_private_request,is_cancelled')
      .eq('id', QA_EVENT).eq('organization_id', QA_ORGANIZATION).maybeSingle()
    if (event.error || event.data?.id !== QA_EVENT || event.data.organization_id !== QA_ORGANIZATION
      || event.data.store_id !== QA_STORE || event.data.scenario_master_id !== QA_SCENARIO_MASTER
      || event.data.organization_scenario_id !== QA_ORGANIZATION_SCENARIO || event.data.category !== 'open'
      || event.data.is_private_booking !== false || event.data.is_private_request !== false
      || event.data.is_cancelled !== false) return blocked
    const customer = await db.from('customers').select('id,user_id,organization_id,email')
      .eq('id', QA_CUSTOMER).eq('user_id', QA_USER).maybeSingle()
    if (customer.error || customer.data?.id !== QA_CUSTOMER || customer.data.user_id !== QA_USER
      || customer.data.organization_id !== null || customer.data.email !== QA_EMAIL) return blocked
    const flags = await db.from('global_settings').select('organization_id,enable_email_notifications,enable_discord_notifications')
      .eq('organization_id', QA_ORGANIZATION).maybeSingle()
    if (flags.error || flags.data?.organization_id !== QA_ORGANIZATION
      || flags.data.enable_email_notifications !== false || flags.data.enable_discord_notifications !== false) return blocked
    return { kind: 'suppressed', reason: 'qa_notification_suppressed' }
  } catch {
    // エラー内容/行データ/秘密値を返さず、送信・queueへのfallbackを禁止する。
    return blocked
  }
}

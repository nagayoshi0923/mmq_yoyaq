import type { PerformanceRequest } from './model'
import { PROTO_ORGANIZATION, PROTO_STORES, findProtoScenario } from './fixtures'

export type RequestSlot = 'morning' | 'afternoon' | 'evening'
/** 店舗は顧客に選ばせず、同組織・作品の現在の上演可能店舗で検討する。 */
export function requestStoreIsEligible(r: PerformanceRequest, storeId: string, organizationId: string = PROTO_ORGANIZATION.id): boolean {
  if ((r.organizationId ?? PROTO_ORGANIZATION.id) !== organizationId) return false
  const scenario = findProtoScenario(r.scenarioId)
  if (!scenario || (scenario.organizationId ?? PROTO_ORGANIZATION.id) !== organizationId) return false
  const available = scenario.availableStoreIds ?? PROTO_STORES.filter((s) => (s.organizationId ?? PROTO_ORGANIZATION.id) === organizationId).map((s) => s.id)
  return available.includes(storeId) && (r.storeIds.length === 0 || r.storeIds.includes(storeId))
}
/** 日付・時間帯は明示指定だけ。店舗未指定は上演可能店舗の候補表示で、予約ではない。 */
export function requestsForSlot(requests: readonly PerformanceRequest[], date: string, storeId: string, slot: RequestSlot,
  organizationId: string = PROTO_ORGANIZATION.id): PerformanceRequest[] {
  return requests.filter((r) => r.dates.includes(date) && r.timeSlots?.includes(slot) && requestStoreIsEligible(r, storeId, organizationId))
}
/** リクエストされたタイトルを先頭へ。残りの既存順は変えず、同じタイトルは一度だけ。 */
export function prioritizeRequestedOptions<T extends { value: string }>(options: readonly T[], titles: ReadonlySet<string>): T[] {
  if (titles.size === 0) return [...options]
  const seen = new Set<string>()
  const unique = options.filter((o) => { if (seen.has(o.value)) return false; seen.add(o.value); return true })
  return [...unique.filter((o) => titles.has(o.value)), ...unique.filter((o) => !titles.has(o.value))]
}
export function isUnspecifiedRequest(r: PerformanceRequest): boolean {
  return r.dates.length === 0 || !r.timeSlots?.length
}

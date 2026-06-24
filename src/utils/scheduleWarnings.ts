/**
 * スケジュールの警告対象公演を集約する。
 *
 * - 未完了警告: シナリオ未定 / GM 未定 / メイン GM 不在
 * - 間隔警告: 同日同店舗で前後の公演と 60 分未満 (intervalWarningEventIds に含まれる ID)
 * - キット警告: 公演店舗または同一キットグループにシナリオキットが無い
 *
 * セル左ボーダー赤警告とカテゴリーバーの「警告:N」カウントの両方で参照する。
 */
import type { ScheduleEvent } from '@/types/schedule'
import type { KitLocation } from '@/types'

type StoreLike = { id: string; name?: string; short_name?: string | null; kit_group_id?: string | null }

export type ScheduleWarningReason = 'incomplete' | 'interval' | 'kit'

export interface ScheduleWarning {
  eventId: string
  date: string
  storeId: string
  storeName: string
  startTime: string
  endTime: string
  scenario: string
  reasons: ScheduleWarningReason[]
}

function isEventIncomplete(event: ScheduleEvent): boolean {
  const gms = event.gms ?? []
  if (!event.scenario || event.scenario.trim() === '') return true
  if (gms.length === 0) return true
  // メイン GM (gm_roles で 'main' か未指定) が 1 人も居ない
  const roles = event.gm_roles ?? {}
  const mainGmCount = gms.filter((g) => !roles[g] || roles[g] === 'main').length
  if (mainGmCount === 0) return true
  return false
}

function getStoreGroupId(storeMap: Map<string, StoreLike>, storeId: string): string {
  const store = storeMap.get(storeId)
  return store?.kit_group_id || storeId
}

function isSameStoreGroup(storeMap: Map<string, StoreLike>, storeId1: string, storeId2: string): boolean {
  return getStoreGroupId(storeMap, storeId1) === getStoreGroupId(storeMap, storeId2)
}

function requiresKitWarningCheck(event: ScheduleEvent): boolean {
  if (event.is_cancelled) return false
  if (!event.scenario_master_id) return false
  return !['offsite', 'venue_rental', 'venue_rental_free', 'mtg'].includes(event.category)
}

export function computeKitWarningEventIds(
  events: ScheduleEvent[],
  kitLocations: KitLocation[],
  stores: StoreLike[],
): Set<string> {
  const storeMap = new Map(stores.map((s) => [s.id, s]))
  const locationsByScenario = new Map<string, KitLocation[]>()

  for (const loc of kitLocations) {
    const scenarioId = loc.scenario_master_id || loc.scenario?.id
    if (!scenarioId) continue
    const list = locationsByScenario.get(scenarioId)
    if (list) list.push(loc)
    else locationsByScenario.set(scenarioId, [loc])
  }

  const warningIds = new Set<string>()
  for (const event of events) {
    if (!requiresKitWarningCheck(event)) continue

    const targetStoreId = event.store_id || event.venue
    const scenarioLocations = locationsByScenario.get(event.scenario_master_id!)
    const hasKitAtVenue = scenarioLocations?.some((loc) =>
      loc.store_id && isSameStoreGroup(storeMap, loc.store_id, targetStoreId)
    ) ?? false

    if (!hasKitAtVenue) {
      warningIds.add(event.id)
    }
  }

  return warningIds
}

export function computeScheduleWarnings(
  events: ScheduleEvent[],
  intervalWarningEventIds: Set<string>,
  stores: StoreLike[],
  kitWarningEventIds: Set<string> = new Set<string>(),
): ScheduleWarning[] {
  const storeMap = new Map(stores.map((s) => [s.id, s.short_name || s.name || '?']))
  const warnings: ScheduleWarning[] = []

  for (const ev of events) {
    if (ev.is_cancelled) continue
    const reasons: ScheduleWarningReason[] = []
    if (isEventIncomplete(ev)) reasons.push('incomplete')
    if (intervalWarningEventIds.has(ev.id)) reasons.push('interval')
    if (kitWarningEventIds.has(ev.id)) reasons.push('kit')
    if (reasons.length === 0) continue
    warnings.push({
      eventId: ev.id,
      date: ev.date,
      storeId: ev.venue,
      storeName: storeMap.get(ev.venue) ?? '?',
      startTime: ev.start_time,
      endTime: ev.end_time,
      scenario: ev.scenario || '',
      reasons,
    })
  }

  warnings.sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? -1 : 1
    if (a.storeName !== b.storeName) return a.storeName < b.storeName ? -1 : 1
    return a.startTime < b.startTime ? -1 : a.startTime > b.startTime ? 1 : 0
  })

  return warnings
}

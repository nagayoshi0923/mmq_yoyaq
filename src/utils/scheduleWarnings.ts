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

function getTodayString(): string {
  const today = new Date()
  const year = today.getFullYear()
  const month = String(today.getMonth() + 1).padStart(2, '0')
  const day = String(today.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

/** 出張・場所貸し・MTG はキット不要のため警告対象外 */
export const KIT_WARNING_EXEMPT_CATEGORIES = [
  'offsite',
  'venue_rental',
  'venue_rental_free',
  'mtg',
] as const

export function requiresKitWarningForCategory(category: string | undefined | null): boolean {
  if (!category) return true
  return !(KIT_WARNING_EXEMPT_CATEGORIES as readonly string[]).includes(category)
}

function requiresKitWarningCheck(event: ScheduleEvent): boolean {
  if (event.is_cancelled) return false
  if (event.date < getTodayString()) return false
  if (!event.scenario_master_id && !event.scenarios?.id) return false
  return requiresKitWarningForCategory(event.category)
}

/**
 * 公演店舗（または同一キットグループ）にキットがあるか。
 * kitStoreIds が空なら false（未登録＝未配置として扱う。スケジュール表と同じ）。
 */
export function hasKitAtVenueOrGroup(
  kitStoreIds: string[],
  venueId: string,
  stores: StoreLike[],
): boolean {
  if (!venueId || kitStoreIds.length === 0) return false
  const storeMap = new Map(stores.map((s) => [s.id, s]))
  return kitStoreIds.some((id) => isSameStoreGroup(storeMap, id, venueId))
}

/** 配置警告では「良好」のキットだけを使用可能として数える。 */
export function getUsableKitStoreIds(kitLocations: KitLocation[]): string[] {
  return Array.from(new Set(kitLocations
    .filter((loc) => loc.condition === 'good')
    .map((loc) => loc.store_id)
    .filter((id): id is string => typeof id === 'string' && id.length > 0)))
}

/** 使用可能（状態が「良好」）なキットの数。1行が1キット。 */
export function countUsableKits(kitLocations: KitLocation[]): number {
  return kitLocations.filter((loc) => loc.condition === 'good').length
}

/**
 * その日に同じ作品を公演する店舗に対して、使用可能なキットが足りるか（#376）。
 * キットは1日に1つの店舗グループ（同じキットグループの店舗は1つと数える）で使う前提で、
 * その日に公演がある店舗グループの数（取消・キット不要の公演を除く）と使用可能なキットの数を比べる。
 * キットが1つもない場合は「キット未配置」の警告に任せ、ここでは返さない。足りない場合だけ返す。
 */
export function computeKitShortageForDay(
  target: { date: string; venueId: string; scenarioId: string; category?: string | null; eventId?: string | null },
  events: ScheduleEvent[],
  usableKitCount: number,
  stores: StoreLike[],
): { demand: number; usable: number } | null {
  if (!target.date || !target.venueId || !target.scenarioId) return null
  if (!requiresKitWarningForCategory(target.category) || usableKitCount <= 0) return null
  const storeMap = new Map(stores.map((s) => [s.id, s]))
  const groups = new Set<string>([getStoreGroupId(storeMap, target.venueId)])
  for (const ev of events) {
    if ((target.eventId && ev.id === target.eventId) || ev.is_cancelled || ev.date !== target.date) continue
    if (!requiresKitWarningForCategory(ev.category)) continue
    if ((ev.scenario_master_id || ev.scenarios?.id) !== target.scenarioId) continue
    const storeId = ev.store_id || ev.venue
    if (storeId) groups.add(getStoreGroupId(storeMap, storeId))
  }
  return groups.size > usableKitCount ? { demand: groups.size, usable: usableKitCount } : null
}

export function computeKitWarningEventIds(
  events: ScheduleEvent[],
  kitLocations: KitLocation[],
  stores: StoreLike[],
): Set<string> {
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
    const scenarioId = event.scenario_master_id || event.scenarios?.id
    const scenarioLocations = scenarioId ? locationsByScenario.get(scenarioId) : undefined
    const kitStoreIds = getUsableKitStoreIds(scenarioLocations ?? [])
    // 配置0件でも未配置として警告する（表・モーダル共通）
    if (!hasKitAtVenueOrGroup(kitStoreIds, targetStoreId, stores)) {
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

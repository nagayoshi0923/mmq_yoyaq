import type { KitLocation, KitTransferSuggestion } from '@/types'

export type SuggestionGroup = {
  from_store_id: string
  from_store_name: string
  to_store_id: string
  to_store_name: string
  isGrouped: boolean
  items: KitTransferSuggestion[]
}

export type TransferDayView = {
  dateStr: string
  groups: SuggestionGroup[]
}

type BuildTransferPlanViewModelParams = {
  plannedTransfers: KitTransferSuggestion[]
  mergedSuggestions: KitTransferSuggestion[]
  transferDates: string[]
  kitLocations: KitLocation[]
  getStoreGroupId: (storeId: string) => string
  isPickedUp: (scenarioId: string, kitNumber: number, performanceDate: string, toStoreId: string) => boolean
  isDelivered: (scenarioId: string, kitNumber: number, performanceDate: string, toStoreId: string) => boolean
}

export type TransferPlanViewModel = {
  displaySuggestions: KitTransferSuggestion[]
  visibleSuggestions: KitTransferSuggestion[]
  statusCounts: {
    delivered: number
    pickedUp: number
    remaining: number
  }
  sortedTransferDateStrs: string[]
  sortedDays: TransferDayView[]
  missedPerformances: KitTransferSuggestion[]
}

export function parseLocalDate(dateStr: string): Date {
  const [year, month, day] = dateStr.split('-').map(Number)
  return new Date(year, month - 1, day)
}

export function formatDateStr(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function getActualTransferDate(performanceDate: string, sortedTransferDateStrs: string[]): string | null {
  if (sortedTransferDateStrs.length === 0) return null

  for (let i = sortedTransferDateStrs.length - 1; i >= 0; i--) {
    const transferDateStr = sortedTransferDateStrs[i]
    if (transferDateStr < performanceDate) {
      return transferDateStr
    }
  }

  const lastTransferDate = parseLocalDate(sortedTransferDateStrs[sortedTransferDateStrs.length - 1])
  const prevWeekDate = new Date(lastTransferDate)
  prevWeekDate.setDate(prevWeekDate.getDate() - 7)
  return formatDateStr(prevWeekDate)
}

export function buildTransferPlanViewModel({
  plannedTransfers,
  mergedSuggestions,
  transferDates,
  kitLocations,
  getStoreGroupId,
  isPickedUp,
  isDelivered,
}: BuildTransferPlanViewModelParams): TransferPlanViewModel {
  const completionSuggestions = mergedSuggestions.filter(
    suggestion => suggestion.reason === '完了記録' || !!suggestion.transfer_date,
  )
  const source = [...plannedTransfers, ...completionSuggestions]
  const seen = new Set<string>()
  const displaySuggestions = source.filter(suggestion => {
    const key = [
      suggestion.org_scenario_id || suggestion.scenario_master_id,
      suggestion.kit_number,
      suggestion.from_store_id,
      suggestion.to_store_id,
      suggestion.performance_date,
    ].join('::')
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })

  const plannedTransferDateStrs = displaySuggestions
    .map(suggestion => suggestion.transfer_date)
    .filter((date): date is string => !!date)
  const usesSelectedTransferDates = transferDates.length > 0
  const sortedTransferDateStrs = [
    ...new Set(usesSelectedTransferDates ? transferDates : plannedTransferDateStrs),
  ].sort()

  const missedPerformances: KitTransferSuggestion[] = []
  type ItemWithTransfer = KitTransferSuggestion & { actualTransferDate: string }
  const itemsByTransferDate = new Map<string, ItemWithTransfer[]>()

  const kitCurrentLocationMap = new Map<string, string>()
  for (const loc of kitLocations) {
    const scenarioId = loc.scenario?.id
    if (scenarioId) {
      kitCurrentLocationMap.set(`${scenarioId}-${loc.kit_number}`, loc.store_id)
    }
  }

  for (const item of displaySuggestions) {
    const currentLocation = kitCurrentLocationMap.get(`${item.scenario_master_id}-${item.kit_number}`)
    const itemLookupScenarioId = item.org_scenario_id || item.scenario_master_id
    const itemPickedUp = isPickedUp(itemLookupScenarioId, item.kit_number, item.performance_date, item.to_store_id)
    const itemDelivered = isDelivered(itemLookupScenarioId, item.kit_number, item.performance_date, item.to_store_id)
    if (currentLocation === item.to_store_id && !itemPickedUp && !itemDelivered) {
      continue
    }

    const isFromCompletion = !!item.transfer_date
    const actualTransferDateStr = isFromCompletion
      ? item.transfer_date
      : getActualTransferDate(item.performance_date, sortedTransferDateStrs)

    if (actualTransferDateStr && item.performance_date <= actualTransferDateStr) {
      if (!isFromCompletion) {
        missedPerformances.push(item)
      }
      continue
    }

    if (!actualTransferDateStr) continue
    if (usesSelectedTransferDates && !transferDates.includes(actualTransferDateStr)) continue

    if (!itemsByTransferDate.has(actualTransferDateStr)) {
      itemsByTransferDate.set(actualTransferDateStr, [])
    }
    itemsByTransferDate.get(actualTransferDateStr)!.push({
      ...item,
      actualTransferDate: actualTransferDateStr,
    })
  }

  const sortedDays = [...itemsByTransferDate.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([dateStr, items]) => {
      const routeGroups = new Map<string, ItemWithTransfer[]>()
      for (const item of items) {
        const fromGroupId = getStoreGroupId(item.from_store_id)
        const toGroupId = getStoreGroupId(item.to_store_id)
        const routeKey = `${fromGroupId}->${toGroupId}::${item.scenario_master_id}`
        if (!routeGroups.has(routeKey)) {
          routeGroups.set(routeKey, [])
        }
        routeGroups.get(routeKey)!.push(item)
      }

      const groups: SuggestionGroup[] = []
      for (const [, routeItems] of routeGroups) {
        const first = routeItems[0]
        const fromGroupId = getStoreGroupId(first.from_store_id)
        const toGroupId = getStoreGroupId(first.to_store_id)
        const sortedItems = [...routeItems].sort((a, b) =>
          a.performance_date.localeCompare(b.performance_date)
        )
        groups.push({
          from_store_id: first.from_store_id,
          from_store_name: first.from_store_name,
          to_store_id: first.to_store_id,
          to_store_name: first.to_store_name,
          isGrouped: fromGroupId === toGroupId,
          items: sortedItems,
        })
      }

      return { dateStr, groups }
    })

  const visibleSuggestions = sortedDays.flatMap(day =>
    day.groups.flatMap(group => group.items)
  )
  const delivered = visibleSuggestions.filter(item => {
    const lookupScenarioId = item.org_scenario_id || item.scenario_master_id
    return isDelivered(lookupScenarioId, item.kit_number, item.performance_date, item.to_store_id)
  }).length
  const pickedUp = visibleSuggestions.filter(item => {
    const lookupScenarioId = item.org_scenario_id || item.scenario_master_id
    return (
      isPickedUp(lookupScenarioId, item.kit_number, item.performance_date, item.to_store_id) &&
      !isDelivered(lookupScenarioId, item.kit_number, item.performance_date, item.to_store_id)
    )
  }).length

  return {
    displaySuggestions,
    visibleSuggestions,
    statusCounts: {
      delivered,
      pickedUp,
      remaining: visibleSuggestions.length - delivered - pickedUp,
    },
    sortedTransferDateStrs,
    sortedDays,
    missedPerformances,
  }
}

import type { KitLocation, KitTransferSuggestion, Store, StoreTravelTime } from '@/types'

export type SuggestionGroup = {
  from_store_id: string
  from_store_name: string
  to_store_id: string
  to_store_name: string
  isGrouped: boolean
  items: KitTransferSuggestion[]
}

export type TransferStartStoreOption = {
  groupId: string
  value: string
  label: string
}

export type TransferRouteStop = {
  groupId: string
  storeIdsInGroup: string[]
  groupStoreName: string
  minutesFromPrevious: number | null
  outgoingRoutes: SuggestionGroup[]
  incomingRoutes: SuggestionGroup[]
  outgoingCount: number
  incomingCount: number
  outgoingItemCount: number
  incomingItemCount: number
  incompleteCount: number
}

export type TransferDayView = {
  dateStr: string
  groups: SuggestionGroup[]
  routeStops: TransferRouteStop[]
  startStoreOptions: TransferStartStoreOption[]
  selectedStartValue: string
}

type BuildTransferPlanViewModelParams = {
  plannedTransfers: KitTransferSuggestion[]
  mergedSuggestions: KitTransferSuggestion[]
  transferDates: string[]
  kitLocations: KitLocation[]
  scheduleEvents?: Array<{
    date: string
    store_id: string
    scenario_master_id: string
    category?: string
    is_cancelled?: boolean
    is_private_request?: boolean
    is_private_booking?: boolean
    current_participants?: number
  }>
  demandDates?: string[]
  storeTravelTimes?: StoreTravelTime[]
  storeMap?: Map<string, Store>
  transferStartStoreIds?: Record<string, string>
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

function normalizePair(storeAId: string, storeBId: string): string {
  return storeAId < storeBId ? `${storeAId}::${storeBId}` : `${storeBId}::${storeAId}`
}

export function buildTransferPlanViewModel({
  plannedTransfers,
  mergedSuggestions,
  transferDates,
  kitLocations,
  scheduleEvents = [],
  demandDates = [],
  storeTravelTimes = [],
  storeMap = new Map(),
  transferStartStoreIds = {},
  getStoreGroupId,
  isPickedUp,
  isDelivered,
}: BuildTransferPlanViewModelParams): TransferPlanViewModel {
  const travelTimeMap = new Map(
    storeTravelTimes.map(t => [normalizePair(t.store_a_id, t.store_b_id), t.minutes])
  )
  const getStoreTravelMinutes = (fromStoreId: string, toStoreId: string): number => {
    if (getStoreGroupId(fromStoreId) === getStoreGroupId(toStoreId)) return 0
    return travelTimeMap.get(normalizePair(fromStoreId, toStoreId)) ?? 30
  }
  const getGroupTravelMinutes = (fromStoreIds: string[], toStoreIds: string[]): number => {
    let best = Number.POSITIVE_INFINITY
    for (const fromId of fromStoreIds) {
      for (const toId of toStoreIds) {
        best = Math.min(best, getStoreTravelMinutes(fromId, toId))
      }
    }
    return Number.isFinite(best) ? best : 30
  }
  const displayOrderOfGroup = (storeIdsInGroup: string[]): number =>
    Math.min(...storeIdsInGroup.map(storeId => storeMap.get(storeId)?.display_order ?? 999))
  const getStoreLabel = (storeId: string): string => {
    const store = storeMap.get(storeId)
    return store?.short_name || store?.name || '?'
  }
  const hasBookings = (suggestion: KitTransferSuggestion) => {
    const toGroupId = getStoreGroupId(suggestion.to_store_id)
    const matchingEvents = scheduleEvents
      .filter(e =>
        e.scenario_master_id === suggestion.scenario_master_id &&
        getStoreGroupId(e.store_id) === toGroupId &&
        demandDates.includes(e.date) &&
        !e.is_cancelled
      )
    const hasPrivatePerformance = matchingEvents.some(e =>
      e.category === 'private' || e.is_private_request || e.is_private_booking
    )
    if (hasPrivatePerformance) return true
    const total = matchingEvents.reduce((s, e) => s + (e.current_participants || 0), 0)
    return total > 0
  }
  const getSuggestionPriorityRank = (suggestion: KitTransferSuggestion) => {
    return hasBookings(suggestion) ? 0 : 1
  }
  const sortSuggestionsByPriority = (items: KitTransferSuggestion[]) => {
    return [...items].sort((a, b) => {
      const priorityDiff = getSuggestionPriorityRank(a) - getSuggestionPriorityRank(b)
      if (priorityDiff !== 0) return priorityDiff
      const dateDiff = a.performance_date.localeCompare(b.performance_date)
      if (dateDiff !== 0) return dateDiff
      const titleDiff = a.scenario_title.localeCompare(b.scenario_title, 'ja')
      if (titleDiff !== 0) return titleDiff
      return a.kit_number - b.kit_number
    })
  }
  const getRoutePriorityRank = (route: SuggestionGroup) => {
    return route.items.some(hasBookings) ? 0 : 1
  }
  const sortOutgoingRoutes = (routes: SuggestionGroup[]) => {
    return [...routes].sort((a, b) => {
      const priorityDiff = getRoutePriorityRank(a) - getRoutePriorityRank(b)
      if (priorityDiff !== 0) return priorityDiff
      const storeAData = storeMap.get(a.to_store_id)
      const storeBData = storeMap.get(b.to_store_id)
      return (storeAData?.display_order || 0) - (storeBData?.display_order || 0)
    })
  }
  const sortIncomingRoutes = (routes: SuggestionGroup[]) => {
    return [...routes].sort((a, b) => {
      const priorityDiff = getRoutePriorityRank(a) - getRoutePriorityRank(b)
      if (priorityDiff !== 0) return priorityDiff
      const storeAData = storeMap.get(a.from_store_id)
      const storeBData = storeMap.get(b.from_store_id)
      return (storeAData?.display_order || 0) - (storeBData?.display_order || 0)
    })
  }
  const source = [...plannedTransfers, ...mergedSuggestions]
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

      const bySource = new Map<string, SuggestionGroup[]>()
      const byDestination = new Map<string, SuggestionGroup[]>()
      const allStoreIds = new Set<string>()

      for (const group of groups) {
        if (!bySource.has(group.from_store_id)) {
          bySource.set(group.from_store_id, [])
        }
        bySource.get(group.from_store_id)!.push(group)

        if (!byDestination.has(group.to_store_id)) {
          byDestination.set(group.to_store_id, [])
        }
        byDestination.get(group.to_store_id)!.push(group)

        allStoreIds.add(group.from_store_id)
        allStoreIds.add(group.to_store_id)
      }

      const storeGroups = new Map<string, string[]>()
      allStoreIds.forEach(storeId => {
        const groupId = getStoreGroupId(storeId)
        if (!storeGroups.has(groupId)) {
          storeGroups.set(groupId, [])
        }
        storeGroups.get(groupId)!.push(storeId)
      })

      const hasPickupAtGroup = (storeIdsInGroup: string[], groupId: string): boolean =>
        storeIdsInGroup.some(storeId =>
          (bySource.get(storeId) || []).some(route => getStoreGroupId(route.to_store_id) !== groupId)
        )
      const hasDropAtGroup = (storeIdsInGroup: string[], groupId: string): boolean =>
        storeIdsInGroup.some(storeId =>
          (byDestination.get(storeId) || []).some(route => getStoreGroupId(route.from_store_id) !== groupId)
        )
      const canStartAtGroup = (storeIdsInGroup: string[], groupId: string): boolean =>
        hasPickupAtGroup(storeIdsInGroup, groupId) && !hasDropAtGroup(storeIdsInGroup, groupId)
      const canVisitAfter = (storeIdsInGroup: string[], groupId: string, visitedGroupIds: Set<string>): boolean =>
        storeIdsInGroup.every(storeId =>
          (byDestination.get(storeId) || []).every(route => {
            const fromGroupId = getStoreGroupId(route.from_store_id)
            return fromGroupId === groupId || visitedGroupIds.has(fromGroupId)
          })
        )
      const orderGroupsByRoute = (entries: Array<[string, string[]]>): Array<[string, string[]]> => {
        if (entries.length <= 1) return entries
        const remaining = [...entries].sort((a, b) => displayOrderOfGroup(a[1]) - displayOrderOfGroup(b[1]))
        const selectedStartStoreId = transferStartStoreIds[dateStr]
        const selectedStartGroupId = selectedStartStoreId ? getStoreGroupId(selectedStartStoreId) : null
        const selectedStartIndex = selectedStartGroupId
          ? remaining.findIndex(([groupId, storeIds]) =>
            (groupId === selectedStartGroupId || storeIds.includes(selectedStartStoreId)) &&
            canStartAtGroup(storeIds, groupId)
          )
          : -1
        const pickupStartIndex = remaining.findIndex(([groupId, storeIds]) => canStartAtGroup(storeIds, groupId))
        const fallbackPickupStartIndex = remaining.findIndex(([groupId, storeIds]) => hasPickupAtGroup(storeIds, groupId))
        const startIndex = selectedStartIndex >= 0 ? selectedStartIndex : pickupStartIndex
        const ordered: Array<[string, string[]]> = [
          remaining.splice(startIndex >= 0 ? startIndex : fallbackPickupStartIndex >= 0 ? fallbackPickupStartIndex : 0, 1)[0],
        ]

        while (remaining.length > 0) {
          const current = ordered[ordered.length - 1]
          const visitedGroupIds = new Set(ordered.map(([groupId]) => groupId))
          const readyIndexes = remaining
            .map((entry, index) => ({ entry, index }))
            .filter(({ entry }) => canVisitAfter(entry[1], entry[0], visitedGroupIds))
          let nextIndex = 0
          let nextMinutes = Number.POSITIVE_INFINITY
          const candidates = readyIndexes.length > 0
            ? readyIndexes
            : remaining.map((entry, index) => ({ entry, index }))
          for (const { entry, index } of candidates) {
            const minutes = getGroupTravelMinutes(current[1], entry[1])
            if (minutes < nextMinutes) {
              nextMinutes = minutes
              nextIndex = index
            }
          }
          ordered.push(remaining.splice(nextIndex, 1)[0])
        }

        return ordered
      }

      const sortedStoreGroups = orderGroupsByRoute([...storeGroups.entries()])
      const startStoreOptions = [...storeGroups.entries()]
        .filter(([groupId, storeIds]) => canStartAtGroup(storeIds, groupId))
        .sort((a, b) => displayOrderOfGroup(a[1]) - displayOrderOfGroup(b[1]))
        .map(([groupId, storeIds]) => ({
          groupId,
          value: storeIds[0],
          label: storeIds.map(getStoreLabel).join(' / '),
        }))
      const selectedStartStoreId = transferStartStoreIds[dateStr]
      const selectedStartValue = startStoreOptions.some(option => option.value === selectedStartStoreId)
        ? selectedStartStoreId
        : '__auto__'

      let returnToStartIncomingRoutes: SuggestionGroup[] = []
      const routeStops = sortedStoreGroups.map(([groupId, storeIdsInGroup], stopIndex) => {
        const groupOutgoing: SuggestionGroup[] = []
        const groupIncoming: SuggestionGroup[] = []

        storeIdsInGroup.forEach(storeId => {
          const outgoing = bySource.get(storeId) || []
          const incoming = byDestination.get(storeId) || []
          outgoing.forEach(route => {
            if (getStoreGroupId(route.to_store_id) !== groupId) {
              groupOutgoing.push(route)
            }
          })
          incoming.forEach(route => {
            if (getStoreGroupId(route.from_store_id) !== groupId) {
              groupIncoming.push(route)
            }
          })
        })

        const outgoingRoutes = sortOutgoingRoutes(groupOutgoing)
          .map(route => ({ ...route, items: sortSuggestionsByPriority(route.items) }))
        const sortedIncomingRoutes = sortIncomingRoutes(groupIncoming)
          .map(route => ({ ...route, items: sortSuggestionsByPriority(route.items) }))
        if (stopIndex === 0) {
          returnToStartIncomingRoutes = sortedIncomingRoutes
        }
        const incomingRoutes = stopIndex === 0 ? [] : sortedIncomingRoutes
        const previousGroup = stopIndex > 0 ? sortedStoreGroups[stopIndex - 1] : null

        const outgoingCount = outgoingRoutes.reduce((sum, r) => sum + r.items.filter(hasBookings).length, 0)
        const incomingCount = incomingRoutes.reduce((sum, r) => sum + r.items.filter(hasBookings).length, 0)
        const outgoingItemCount = outgoingRoutes.reduce((sum, r) => sum + r.items.length, 0)
        const incomingItemCount = incomingRoutes.reduce((sum, r) => sum + r.items.length, 0)
        const incompleteCount =
          outgoingRoutes.reduce((sum, r) => sum + r.items.filter(s => {
            if (!hasBookings(s)) return false
            const id = s.org_scenario_id || s.scenario_master_id
            return !isPickedUp(id, s.kit_number, s.performance_date, s.to_store_id)
          }).length, 0) +
          incomingRoutes.reduce((sum, r) => sum + r.items.filter(s => {
            if (!hasBookings(s)) return false
            const id = s.org_scenario_id || s.scenario_master_id
            return !isDelivered(id, s.kit_number, s.performance_date, s.to_store_id)
          }).length, 0)

        return {
          groupId,
          storeIdsInGroup,
          groupStoreName: storeIdsInGroup.map(getStoreLabel).join(' / '),
          minutesFromPrevious: previousGroup
            ? getGroupTravelMinutes(previousGroup[1], storeIdsInGroup)
            : null,
          outgoingRoutes,
          incomingRoutes,
          outgoingCount,
          incomingCount,
          outgoingItemCount,
          incomingItemCount,
          incompleteCount,
        }
      })
      if (returnToStartIncomingRoutes.length > 0 && routeStops.length > 0) {
        const startStop = routeStops[0]
        const previousStop = routeStops[routeStops.length - 1]
        const incomingCount = returnToStartIncomingRoutes.reduce((sum, r) => sum + r.items.filter(hasBookings).length, 0)
        const incomingItemCount = returnToStartIncomingRoutes.reduce((sum, r) => sum + r.items.length, 0)
        const incompleteCount = returnToStartIncomingRoutes.reduce((sum, r) => sum + r.items.filter(s => {
          if (!hasBookings(s)) return false
          const id = s.org_scenario_id || s.scenario_master_id
          return !isDelivered(id, s.kit_number, s.performance_date, s.to_store_id)
        }).length, 0)
        routeStops.push({
          ...startStop,
          groupId: `${startStop.groupId}::return`,
          minutesFromPrevious: getGroupTravelMinutes(previousStop.storeIdsInGroup, startStop.storeIdsInGroup),
          outgoingRoutes: [],
          incomingRoutes: returnToStartIncomingRoutes,
          outgoingCount: 0,
          incomingCount,
          outgoingItemCount: 0,
          incomingItemCount,
          incompleteCount,
        })
      }

      return {
        dateStr,
        groups,
        routeStops,
        startStoreOptions,
        selectedStartValue,
      }
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

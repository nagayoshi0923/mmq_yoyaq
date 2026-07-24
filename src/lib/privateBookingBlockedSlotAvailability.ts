import {
  scheduleTimeSlotToEn,
  timeSlotEnToCandidate,
  type TimeSlotEn,
} from '@/lib/timeSlot'

export type CanonicalPrivateBookingTimeSlot = 'morning' | 'afternoon' | 'evening'

export interface PrivateBookingBlockedSlotRow {
  date: string
  store_id: string
  time_slot: string
  created_at?: string | null
}

export interface PrivateBookingCandidateAvailabilityInput {
  date: string
  timeSlot: string
}

export interface PrivateBookingCandidateBlockedState {
  canonicalTimeSlot: CanonicalPrivateBookingTimeSlot | null
  blockedStoreIds: string[]
  availableStoreIds: string[]
  allStoresBlocked: boolean
  partiallyBlocked: boolean
}

export type PrivateBookingBlockedTiming =
  | 'none'
  | 'blocked_after_request'
  | 'blocked_at_request'

export function toCanonicalPrivateBookingTimeSlot(
  value: string | null | undefined
): CanonicalPrivateBookingTimeSlot | null {
  if (value === 'morning' || value === 'afternoon' || value === 'evening') {
    return value
  }
  const scheduleSlot = scheduleTimeSlotToEn(value)
  if (scheduleSlot) return scheduleSlot
  const candidates: TimeSlotEn[] = ['morning', 'afternoon', 'evening']
  return candidates.find((slot) => timeSlotEnToCandidate(slot) === value) ?? null
}

export function createPrivateBookingBlockedSlotKey(
  date: string,
  storeId: string,
  timeSlot: string
): string | null {
  const canonicalTimeSlot = toCanonicalPrivateBookingTimeSlot(timeSlot)
  if (!canonicalTimeSlot || !date || !storeId) return null
  return `${date}:${storeId}:${canonicalTimeSlot}`
}

export function buildPrivateBookingBlockedSlotIndex(
  rows: PrivateBookingBlockedSlotRow[]
): Map<string, PrivateBookingBlockedSlotRow> {
  const index = new Map<string, PrivateBookingBlockedSlotRow>()
  for (const row of rows) {
    const key = createPrivateBookingBlockedSlotKey(row.date, row.store_id, row.time_slot)
    if (key) index.set(key, row)
  }
  return index
}

export function getPrivateBookingCandidateBlockedState(
  candidate: PrivateBookingCandidateAvailabilityInput,
  storeIds: string[],
  blockedRowsOrIndex: PrivateBookingBlockedSlotRow[] | Map<string, PrivateBookingBlockedSlotRow>
): PrivateBookingCandidateBlockedState {
  const canonicalTimeSlot = toCanonicalPrivateBookingTimeSlot(candidate.timeSlot)
  const index = Array.isArray(blockedRowsOrIndex)
    ? buildPrivateBookingBlockedSlotIndex(blockedRowsOrIndex)
    : blockedRowsOrIndex

  if (!canonicalTimeSlot || storeIds.length === 0) {
    return {
      canonicalTimeSlot,
      blockedStoreIds: [],
      availableStoreIds: [...storeIds],
      allStoresBlocked: false,
      partiallyBlocked: false,
    }
  }

  const blockedStoreIds = storeIds.filter((storeId) =>
    index.has(`${candidate.date}:${storeId}:${canonicalTimeSlot}`)
  )
  const blockedSet = new Set(blockedStoreIds)
  const availableStoreIds = storeIds.filter((storeId) => !blockedSet.has(storeId))

  return {
    canonicalTimeSlot,
    blockedStoreIds,
    availableStoreIds,
    allStoresBlocked: blockedStoreIds.length === storeIds.length,
    partiallyBlocked: blockedStoreIds.length > 0 && blockedStoreIds.length < storeIds.length,
  }
}

export function classifyPrivateBookingBlockedTiming(
  candidate: PrivateBookingCandidateAvailabilityInput,
  storeIds: string[],
  blockedRows: PrivateBookingBlockedSlotRow[],
  requestCreatedAt: string
): PrivateBookingBlockedTiming {
  const state = getPrivateBookingCandidateBlockedState(candidate, storeIds, blockedRows)
  if (!state.allStoresBlocked || state.blockedStoreIds.length === 0) return 'none'

  const requestCreatedTime = Date.parse(requestCreatedAt)
  if (!Number.isFinite(requestCreatedTime)) return 'blocked_after_request'

  const index = buildPrivateBookingBlockedSlotIndex(blockedRows)
  const allWereBlockedAtRequest = state.blockedStoreIds.every((storeId) => {
    const row = index.get(`${candidate.date}:${storeId}:${state.canonicalTimeSlot}`)
    const blockedAt = row?.created_at ? Date.parse(row.created_at) : Number.NaN
    return Number.isFinite(blockedAt) && blockedAt <= requestCreatedTime
  })

  return allWereBlockedAtRequest ? 'blocked_at_request' : 'blocked_after_request'
}

export function formatBlockedCandidateLabel(
  candidate: PrivateBookingCandidateAvailabilityInput,
  storeNames: string[]
): string {
  const stores = storeNames.length > 0 ? storeNames.join('、') : '希望店舗'
  return `${candidate.date} ${candidate.timeSlot}（${stores}）`
}

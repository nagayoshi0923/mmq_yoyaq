import { normalizeToJapanCalendarYmd } from '@/lib/japanCalendarDate'
import { isDateInRecruitmentPause, type StoreRecruitmentPausePeriod } from '@/lib/storeRecruitmentPause'
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
  const time = (row: PrivateBookingBlockedSlotRow) => row.created_at ? Date.parse(row.created_at) : Number.POSITIVE_INFINITY
  for (const row of rows) {
    const key = createPrivateBookingBlockedSlotKey(row.date, row.store_id, row.time_slot)
    if (!key) continue
    // 同じ枠に複数の停止がある場合は、早く入った方を残す（申請の前から止まっていたかの判定に使う）
    const current = index.get(key)
    if (!current || time(row) < time(current)) index.set(key, row)
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

/**
 * 店舗の「貸切募集停止」期間（営業時間設定）を、候補日ごと・時間帯ごとの停止枠に置き換える。
 * 承認画面はスケジュールで止めた枠と同じ扱いで「受付停止中」を表示する（サーバーの承認処理も同じ期間で止める）。
 */
export function privateRecruitmentPauseRows(
  periods: Array<StoreRecruitmentPausePeriod & { created_at?: string | null }>,
  dates: string[],
): PrivateBookingBlockedSlotRow[] {
  const rows: PrivateBookingBlockedSlotRow[] = []
  for (const period of periods) {
    if (period.pause_type !== 'private') continue
    for (const raw of new Set(dates)) {
      // 候補日は日時の文字列のこともあるため、日本の暦日にそろえてから期間と比べる（承認処理と同じ）
      const date = normalizeToJapanCalendarYmd(raw) || raw
      if (!isDateInRecruitmentPause(date, period)) continue
      // 画面は候補日の元の文字列で引くため、元の値と暦日の両方で枠を作る
      for (const key of new Set([raw, date])) {
        for (const time_slot of ['morning', 'afternoon', 'evening'] as const) {
          rows.push({ date: key, store_id: period.store_id, time_slot, created_at: period.created_at ?? null })
        }
      }
    }
  }
  return rows
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

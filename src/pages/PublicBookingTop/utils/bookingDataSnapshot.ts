import type { BookingDataResult } from '../hooks/useBookingData'

const SNAPSHOT_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000

interface StoredWrapper {
  v: 1
  savedAt: number
  data: BookingDataResult
}

/**
 * 組織予約トップ（/queens-waltz 等）リロード時に一覧を消さない（stale-while-revalidate）
 */
export function readBookingDataSnapshot(slug: string): { data: BookingDataResult; savedAt: number } | null {
  try {
    const key = `booking-data-snapshot-v1-${slug}`
    const raw = sessionStorage.getItem(key)
    if (!raw) return null
    const o = JSON.parse(raw) as Partial<StoredWrapper>
    if (o.v !== 1 || !o.data || typeof o.savedAt !== 'number') return null
    if (Date.now() - o.savedAt > SNAPSHOT_MAX_AGE_MS) return null
    if (o.data.organizationNotFound) return null
    return { data: o.data as BookingDataResult, savedAt: o.savedAt }
  } catch {
    return null
  }
}

export function writeBookingDataSnapshot(slug: string, data: BookingDataResult): void {
  if (!slug || data.organizationNotFound) return
  try {
    const key = `booking-data-snapshot-v1-${slug}`
    const payload: StoredWrapper = {
      v: 1,
      savedAt: Date.now(),
      data,
    }
    sessionStorage.setItem(key, JSON.stringify(payload))
  } catch {
    /* 容量超過等 */
  }
}

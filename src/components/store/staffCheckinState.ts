export type StaffCheckinState =
  | { status: 'loading' }
  | { status: 'ready-unchecked'; staffName?: string; performance?: StaffCheckinPerformance }
  | { status: 'ready-checked'; checkedInAt: string; staffName?: string; performance?: StaffCheckinPerformance }
  | { status: 'error'; message: string }
  | { status: 'unavailable' }

export interface StaffCheckinPerformance {
  startTime: string
  scenario: string
  storeName: string
}

export function normalizeStaffCheckinResponse(value: unknown): StaffCheckinState {
  if (!isRecord(value)) return responseError()
  if (value.available === false) return { status: 'unavailable' }
  if (value.available !== true || !('my_checkin' in value)) return responseError()
  const context = normalizeContext(value)
  if (value.my_checkin === null) return { status: 'ready-unchecked', ...context }
  if (!isRecord(value.my_checkin) || typeof value.my_checkin.checked_in_at !== 'string') return responseError()
  if (!Number.isFinite(Date.parse(value.my_checkin.checked_in_at))) return responseError()
  return { status: 'ready-checked', checkedInAt: value.my_checkin.checked_in_at, ...context }
}

export function formatCheckedInTime(value: string) {
  return new Intl.DateTimeFormat('ja-JP', {
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    timeZone: 'Asia/Tokyo',
  }).format(new Date(value))
}

export function formatClientCurrentTime(now = new Date()) {
  return new Intl.DateTimeFormat('ja-JP', {
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(now)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function responseError(): StaffCheckinState {
  return { status: 'error', message: '出勤打刻の状態を確認できませんでした。' }
}

function normalizeContext(value: Record<string, unknown>) {
  const staffName = typeof value.staff_name === 'string' && value.staff_name.trim() ? value.staff_name.trim() : undefined
  const performance = isRecord(value.performance)
    && typeof value.performance.start_time === 'string' && value.performance.start_time.trim()
    && typeof value.performance.scenario === 'string' && value.performance.scenario.trim()
    && typeof value.performance.store_name === 'string' && value.performance.store_name.trim()
    ? {
        startTime: value.performance.start_time.trim(),
        scenario: value.performance.scenario.trim(),
        storeName: value.performance.store_name.trim(),
      }
    : undefined
  return { ...(staffName ? { staffName } : {}), ...(performance ? { performance } : {}) }
}

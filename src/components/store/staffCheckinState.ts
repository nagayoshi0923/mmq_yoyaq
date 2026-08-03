export type StaffCheckinState =
  | { status: 'loading' }
  | { status: 'ready-unchecked' }
  | { status: 'ready-checked'; checkedInAt: string }
  | { status: 'error'; message: string }
  | { status: 'unavailable' }

export function normalizeStaffCheckinResponse(value: unknown): StaffCheckinState {
  if (!isRecord(value)) return responseError()
  if (value.available === false) return { status: 'unavailable' }
  if (value.available !== true || !('my_checkin' in value)) return responseError()
  if (value.my_checkin === null) return { status: 'ready-unchecked' }
  if (!isRecord(value.my_checkin) || typeof value.my_checkin.checked_in_at !== 'string') return responseError()
  if (!Number.isFinite(Date.parse(value.my_checkin.checked_in_at))) return responseError()
  return { status: 'ready-checked', checkedInAt: value.my_checkin.checked_in_at }
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

export type PrivateBookingUrlSlotKey = 'morning' | 'afternoon' | 'evening'

export const PRIVATE_BOOKING_URL_SLOT_LABEL: Record<PrivateBookingUrlSlotKey, string> = {
  morning: '午前',
  afternoon: '午後',
  evening: '夜',
}

/** カレンダー貸切ボタンと同系統のフォールバック開始時刻 */
export const PRIVATE_BOOKING_URL_DEFAULT_START: Record<PrivateBookingUrlSlotKey, string> = {
  morning: '09:00',
  afternoon: '14:00',
  evening: '19:00',
}

export function slotParamToKey(param: string): PrivateBookingUrlSlotKey | null {
  const map: Record<string, PrivateBookingUrlSlotKey> = {
    morning: 'morning',
    afternoon: 'afternoon',
    evening: 'evening',
    午前: 'morning',
    午後: 'afternoon',
    夜: 'evening',
  }
  return Object.prototype.hasOwnProperty.call(map, param) ? map[param] : null
}

function isValidHHmm(time: string): boolean {
  if (!/^\d{1,2}:\d{2}(:\d{2})?$/.test(time)) return false
  const [hour, minute, second = 0] = time.split(':').map(Number)
  return hour < 24 && minute < 60 && second < 60
}

function normalizeHHmm(time: string): string {
  const [h, m] = time.trim().split(':')
  return `${String(Number(h)).padStart(2, '0')}:${String(Number(m)).padStart(2, '0')}`
}

export type ComputedPrivateBookingSlotLike = {
  key: string
  label: string
  startTime: string
  endTime: string
}

/**
 * カレンダー等の URL（date/slot/time）から貸切リクエスト候補1件を解決する。
 * computePrivateBookingSlots で枠が取れなくても、slot(+time) があれば候補を落とさない。
 */
export function resolvePrivateBookingUrlPrefillSlot(params: {
  slotParam: string
  timeParam?: string | null
  computedSlots: ComputedPrivateBookingSlotLike[]
}): { label: string; startTime: string; endTime: string } | null {
  const slotKey = slotParamToKey(params.slotParam)
  if (!slotKey) return null

  const found = params.computedSlots.find((s) => s.key === slotKey)
  if (found) {
    return {
      label: found.label,
      startTime: found.startTime,
      endTime: found.endTime,
    }
  }

  const timeRaw = (params.timeParam || '').trim()
  const startTime =
    timeRaw && isValidHHmm(timeRaw)
      ? normalizeHHmm(timeRaw)
      : PRIVATE_BOOKING_URL_DEFAULT_START[slotKey]

  return {
    label: PRIVATE_BOOKING_URL_SLOT_LABEL[slotKey],
    startTime,
    // 終了時刻は PrivateBookingRequest 側の enrichSlotEnd でシナリオ所要に合わせる
    endTime: startTime,
  }
}

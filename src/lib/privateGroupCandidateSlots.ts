import { isJapaneseHoliday } from '@/utils/japaneseHolidays'
import { getDayOfWeekJST } from '@/utils/dateUtils'

/** business_hours_settings から取得する想定の最小形 */
export type BusinessHoursSettingRow = {
  store_id: string
  opening_hours: Record<string, DayHoursLike> | null
  holidays?: string[] | null
  special_open_days?: { date: string }[] | null
  special_closed_days?: { date: string }[] | null
}

type DayHoursLike = {
  is_open?: boolean
  open_time?: string
  close_time?: string
  available_slots?: ('morning' | 'afternoon' | 'evening')[]
  slot_start_times?: {
    morning?: string
    afternoon?: string
    evening?: string
  }
}

export type PrivateGroupCandidateTimeSlot = {
  label: '午前' | '午後' | '夜'
  startTime: string
  endTime: string
  key: 'morning' | 'afternoon' | 'evening'
}

const DAY_NAMES = [
  'sunday',
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
] as const

const defaultSlotTimesWeekend: Record<'morning' | 'afternoon' | 'evening', string> = {
  morning: '10:00',
  afternoon: '14:00',
  evening: '19:00',
}

const defaultSlotTimesWeekday: Record<'morning' | 'afternoon' | 'evening', string> = {
  morning: '10:00',
  afternoon: '13:00',
  evening: '19:00',
}

/** 営業時間設定画面の defaultWeekendHours / defaultWeekdayHours と揃える（マージベース用） */
const DEFAULT_WEEKEND_DAY: DayHoursLike = {
  is_open: true,
  open_time: '09:00',
  close_time: '23:00',
  available_slots: ['morning', 'afternoon', 'evening'],
  slot_start_times: { ...defaultSlotTimesWeekend },
}

const DEFAULT_WEEKDAY_DAY: DayHoursLike = {
  is_open: true,
  open_time: '13:00',
  close_time: '23:00',
  available_slots: ['afternoon', 'evening'],
  slot_start_times: { ...defaultSlotTimesWeekday },
}

function normalizeOpeningHoursKeys(
  oh: Record<string, DayHoursLike> | null | undefined
): Record<string, DayHoursLike> | null {
  if (!oh || typeof oh !== 'object') return null
  const out: Record<string, DayHoursLike> = {}
  for (const [k, v] of Object.entries(oh)) {
    if (v && typeof v === 'object') {
      out[k.toLowerCase()] = v as DayHoursLike
    }
  }
  return Object.keys(out).length > 0 ? out : null
}

function mergeDayHoursWithDefaults(
  dayKey: (typeof DAY_NAMES)[number],
  raw: DayHoursLike
): { merged: DayHoursLike; explicitMorningInDb: boolean } {
  const isWeekend = dayKey === 'saturday' || dayKey === 'sunday'
  const base = isWeekend ? DEFAULT_WEEKEND_DAY : DEFAULT_WEEKDAY_DAY
  const rawMorning = raw.slot_start_times?.morning
  const explicitMorningInDb = typeof rawMorning === 'string' && rawMorning.includes(':')
  const merged: DayHoursLike = {
    ...base,
    ...raw,
    slot_start_times: {
      ...base.slot_start_times,
      ...raw.slot_start_times,
    },
  }
  return { merged, explicitMorningInDb }
}

const SLOT_END_LIMITS: Record<'morning' | 'afternoon' | 'evening', number> = {
  morning: 13 * 60,
  afternoon: 19 * 60,
  evening: 23 * 60,
}

function timeToMinutes(t: string): number {
  const [h, m = 0] = t.split(':').map(Number)
  return h * 60 + m
}

function minutesToTime(minutes: number): string {
  const h = Math.floor(minutes / 60) % 24
  const m = minutes % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

function getDefaultAvailableSlots(
  dayOfWeek: number,
  dateStr: string,
  isCustomHoliday: (d: string) => boolean
): ('morning' | 'afternoon' | 'evening')[] {
  const isWeekend = dayOfWeek === 0 || dayOfWeek === 6
  const isHoliday = isJapaneseHoliday(dateStr) || isCustomHoliday(dateStr)
  if (isWeekend || isHoliday) {
    return ['morning', 'afternoon', 'evening']
  }
  return ['afternoon', 'evening']
}

function getEffectiveDayName(
  dayOfWeek: number,
  dateStr: string,
  isCustomHoliday: (d: string) => boolean
): (typeof DAY_NAMES)[number] {
  const isWeekend = dayOfWeek === 0 || dayOfWeek === 6
  const isHoliday = isJapaneseHoliday(dateStr) || isCustomHoliday(dateStr)
  const isWeekendOrHoliday = isWeekend || isHoliday
  if (isWeekendOrHoliday && dayOfWeek !== 0 && dayOfWeek !== 6) {
    return 'sunday'
  }
  return DAY_NAMES[dayOfWeek]
}

function parseCloseToMinutes(closeTime?: string): number {
  if (!closeTime || !closeTime.includes(':')) return SLOT_END_LIMITS.evening
  return Math.min(timeToMinutes(closeTime), SLOT_END_LIMITS.evening)
}

type PerStoreSlot = {
  key: 'morning' | 'afternoon' | 'evening'
  startMin: number
  endMin: number
}

/**
 * 1店舗・1日分の公演枠（貸切グループ候補用）。営業時間設定に準拠。
 */
function buildSlotsFromDayConfig(
  dayHours: DayHoursLike,
  weekendStyleDefaults: boolean,
  dayOfWeek: number,
  dateStr: string,
  isCustomHoliday: (d: string) => boolean,
  options?: { explicitMorningInDb?: boolean }
): PerStoreSlot[] {
  let availableSlots =
    dayHours.available_slots && dayHours.available_slots.length > 0
      ? [...dayHours.available_slots]
      : getDefaultAvailableSlots(dayOfWeek, dateStr, isCustomHoliday)

  if (weekendStyleDefaults && !availableSlots.includes('morning')) {
    availableSlots = ['morning', ...availableSlots]
  }

  const defaultStarts = weekendStyleDefaults ? defaultSlotTimesWeekend : defaultSlotTimesWeekday
  const startMinutes: Record<'morning' | 'afternoon' | 'evening', number> = {
    morning: timeToMinutes(defaultStarts.morning),
    afternoon: timeToMinutes(defaultStarts.afternoon),
    evening: timeToMinutes(defaultStarts.evening),
  }

  const st = dayHours.slot_start_times
  if (st?.morning?.includes(':')) startMinutes.morning = timeToMinutes(st.morning)
  if (st?.afternoon?.includes(':')) startMinutes.afternoon = timeToMinutes(st.afternoon)
  if (st?.evening?.includes(':')) startMinutes.evening = timeToMinutes(st.evening)

  // DBに朝の開始が無い古いデータでは設定画面は開店時刻を見せるが、JSON には open_time だけ残っていることが多い
  if (
    options?.explicitMorningInDb === false &&
    availableSlots.includes('morning') &&
    typeof dayHours.open_time === 'string' &&
    dayHours.open_time.includes(':')
  ) {
    const openM = timeToMinutes(dayHours.open_time)
    if (openM < SLOT_END_LIMITS.morning) {
      startMinutes.morning = openM
    }
  }

  const eveningEndCap = parseCloseToMinutes(dayHours.close_time)

  const out: PerStoreSlot[] = []
  const order: ('morning' | 'afternoon' | 'evening')[] = ['morning', 'afternoon', 'evening']

  for (const key of order) {
    if (!availableSlots.includes(key)) continue

    const slotEnd =
      key === 'evening' ? eveningEndCap : SLOT_END_LIMITS[key]

    const startMin = startMinutes[key]
    if (startMin >= slotEnd) continue

    out.push({
      key,
      startMin,
      endMin: slotEnd,
    })
  }

  return out
}

function getSyntheticSlotsWhenNoRow(
  dateStr: string,
  isCustomHoliday: (d: string) => boolean
): PerStoreSlot[] {
  const dayOfWeek = getDayOfWeekJST(dateStr)
  const isWeekend = dayOfWeek === 0 || dayOfWeek === 6
  const isHol = isJapaneseHoliday(dateStr) || isCustomHoliday(dateStr)
  const isWeekendOrHoliday = isWeekend || isHol
  const synthetic: DayHoursLike = {
    is_open: true,
    close_time: '23:00',
    available_slots: getDefaultAvailableSlots(dayOfWeek, dateStr, isCustomHoliday),
    slot_start_times: isWeekendOrHoliday ? defaultSlotTimesWeekend : defaultSlotTimesWeekday,
  }
  return buildSlotsFromDayConfig(
    synthetic,
    isWeekendOrHoliday,
    dayOfWeek,
    dateStr,
    isCustomHoliday,
    { explicitMorningInDb: true }
  )
}

/** 1店舗・1日の公演枠（開始/終了分）。貸切シナリオ詳細の複数店舗判定でも利用する */
export function getPerStoreSlotsForDate(
  dateStr: string,
  row: BusinessHoursSettingRow | undefined,
  isCustomHoliday: (d: string) => boolean,
  options: { allowSyntheticWhenMissingRow: boolean }
): PerStoreSlot[] | null {
  const dayOfWeek = getDayOfWeekJST(dateStr)

  if (row?.special_closed_days?.some(d => d.date === dateStr)) {
    return null
  }
  if (row?.holidays?.includes(dateStr)) {
    return null
  }

  const isWeekend = dayOfWeek === 0 || dayOfWeek === 6
  const isHol = isJapaneseHoliday(dateStr) || isCustomHoliday(dateStr)
  const isWeekendOrHoliday = isWeekend || isHol

  // 行なし or opening_hours 未設定
  if (!row?.opening_hours) {
    if (!options.allowSyntheticWhenMissingRow) {
      return null
    }
    return getSyntheticSlotsWhenNoRow(dateStr, isCustomHoliday)
  }

  const openingHours = normalizeOpeningHoursKeys(
    row.opening_hours as Record<string, DayHoursLike>
  )
  if (!openingHours) {
    if (!options.allowSyntheticWhenMissingRow) {
      return null
    }
    return getSyntheticSlotsWhenNoRow(dateStr, isCustomHoliday)
  }

  let rawDayBlock: DayHoursLike | null | undefined
  let weekendStyleDefaults = isWeekendOrHoliday
  let dayKeyForMerge: (typeof DAY_NAMES)[number] = 'monday'

  if (row.special_open_days?.some(d => d.date === dateStr)) {
    weekendStyleDefaults = true
    dayKeyForMerge = 'sunday'
    rawDayBlock = openingHours.sunday
    if (!rawDayBlock?.is_open) {
      return buildSlotsFromDayConfig(
        {
          is_open: true,
          open_time: '09:00',
          close_time: '23:00',
          available_slots: ['morning', 'afternoon', 'evening'],
          slot_start_times: { ...defaultSlotTimesWeekend },
        },
        true,
        dayOfWeek,
        dateStr,
        isCustomHoliday,
        { explicitMorningInDb: false }
      )
    }
  } else {
    const effectiveDay = getEffectiveDayName(dayOfWeek, dateStr, isCustomHoliday)
    dayKeyForMerge = effectiveDay
    rawDayBlock = openingHours[effectiveDay]

    if (
      isWeekendOrHoliday &&
      effectiveDay === 'sunday' &&
      (!rawDayBlock || !rawDayBlock.is_open)
    ) {
      const original = openingHours[DAY_NAMES[dayOfWeek]]
      if (original?.is_open) {
        rawDayBlock = original
        dayKeyForMerge = DAY_NAMES[dayOfWeek]
      }
    }
  }

  if (!rawDayBlock?.is_open) {
    return null
  }

  const { merged, explicitMorningInDb } = mergeDayHoursWithDefaults(dayKeyForMerge, rawDayBlock)

  return buildSlotsFromDayConfig(
    merged,
    weekendStyleDefaults,
    dayOfWeek,
    dateStr,
    isCustomHoliday,
    { explicitMorningInDb }
  )
}

/**
 * 複数希望店舗がある場合: 各枠は「いずれかの店舗が受付可能」で表示し、
 * 開始は店舗間の最大（全店がその時刻以降に受付できる）、
 * 終了は最小（全店がその時刻までに収まる帯でイベント重なり判定）。
 */
export function getPrivateGroupCandidateSlotsForDate(
  dateStr: string,
  storeIds: string[],
  hoursByStoreId: Map<string, BusinessHoursSettingRow>,
  isCustomHoliday: (d: string) => boolean
): PrivateGroupCandidateTimeSlot[] {
  if (storeIds.length === 0) {
    return []
  }

  const merged = new Map<
    'morning' | 'afternoon' | 'evening',
    { startMax: number; endMin: number }
  >()

  const allowSynthetic = storeIds.length === 1

  for (const storeId of storeIds) {
    const row = hoursByStoreId.get(storeId)
    const slots = getPerStoreSlotsForDate(dateStr, row, isCustomHoliday, {
      allowSyntheticWhenMissingRow: allowSynthetic,
    })
    if (!slots) continue

    for (const s of slots) {
      const cur = merged.get(s.key)
      if (!cur) {
        merged.set(s.key, { startMax: s.startMin, endMin: s.endMin })
      } else {
        merged.set(s.key, {
          startMax: Math.max(cur.startMax, s.startMin),
          endMin: Math.min(cur.endMin, s.endMin),
        })
      }
    }
  }

  // 複数店舗かつ、どの店にも opening_hours が無い（取得漏れ等）だけ既定枠で表示。
  // 全店休業などでマージが空の日は枠なしのままにする。
  if (merged.size === 0 && storeIds.length > 1) {
    const anyOpeningHoursJson = storeIds.some(
      id => !!hoursByStoreId.get(id)?.opening_hours
    )
    if (!anyOpeningHoursJson) {
      for (const s of getSyntheticSlotsWhenNoRow(dateStr, isCustomHoliday)) {
        merged.set(s.key, { startMax: s.startMin, endMin: s.endMin })
      }
    }
  }

  const labelMap: Record<'morning' | 'afternoon' | 'evening', '午前' | '午後' | '夜'> = {
    morning: '午前',
    afternoon: '午後',
    evening: '夜',
  }

  const result: PrivateGroupCandidateTimeSlot[] = []
  const order: ('morning' | 'afternoon' | 'evening')[] = ['morning', 'afternoon', 'evening']
  for (const key of order) {
    const m = merged.get(key)
    if (!m) continue
    if (m.startMax >= m.endMin) continue
    result.push({
      key,
      label: labelMap[key],
      startTime: minutesToTime(m.startMax),
      endTime: minutesToTime(m.endMin),
    })
  }

  return result
}

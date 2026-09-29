export type SlotKey = 'morning' | 'afternoon' | 'evening'

export type SlotStartTimes = {
  morning?: string | null
  afternoon?: string | null
  evening?: string | null
}

/** シナリオ編集に保存する貸切開始時刻。欠落キーは店舗営業時間設定を使う */
export type ScenarioSlotStartTimes = {
  weekday?: SlotStartTimes | null
  weekend?: SlotStartTimes | null
}

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d/

export function normalizeHHmm(value: string | null | undefined): string | null {
  if (!value || typeof value !== 'string') return null
  const trimmed = value.trim().slice(0, 5)
  return TIME_RE.test(trimmed) ? trimmed : null
}

export function pickScenarioSlotStartTime(
  times: ScenarioSlotStartTimes | null | undefined,
  isWeekendOrHoliday: boolean,
  slot: SlotKey
): string | null {
  if (!times) return null
  const bucket = isWeekendOrHoliday ? times.weekend : times.weekday
  return normalizeHHmm(bucket?.[slot])
}

export function emptyScenarioSlotStartTimes(): ScenarioSlotStartTimes {
  return {
    weekday: { morning: null, afternoon: null, evening: null },
    weekend: { morning: null, afternoon: null, evening: null },
  }
}

export function parseScenarioSlotStartTimes(raw: unknown): ScenarioSlotStartTimes {
  const empty = emptyScenarioSlotStartTimes()
  if (!raw || typeof raw !== 'object') return empty
  const obj = raw as Record<string, unknown>
  const readBucket = (key: 'weekday' | 'weekend'): SlotStartTimes => {
    const b = obj[key]
    if (!b || typeof b !== 'object') return { morning: null, afternoon: null, evening: null }
    const slot = b as Record<string, unknown>
    return {
      morning: normalizeHHmm(typeof slot.morning === 'string' ? slot.morning : null),
      afternoon: normalizeHHmm(typeof slot.afternoon === 'string' ? slot.afternoon : null),
      evening: normalizeHHmm(typeof slot.evening === 'string' ? slot.evening : null),
    }
  }
  return { weekday: readBucket('weekday'), weekend: readBucket('weekend') }
}

export function serializeScenarioSlotStartTimes(
  times: ScenarioSlotStartTimes
): ScenarioSlotStartTimes {
  const compact = (b?: SlotStartTimes | null): SlotStartTimes => ({
    morning: normalizeHHmm(b?.morning) ,
    afternoon: normalizeHHmm(b?.afternoon),
    evening: normalizeHHmm(b?.evening),
  })
  return {
    weekday: compact(times.weekday),
    weekend: compact(times.weekend),
  }
}

export const SCENARIO_START_TIME_OPTIONS: string[] = (() => {
  const options: string[] = []
  for (let hour = 9; hour <= 22; hour++) {
    options.push(`${String(hour).padStart(2, '0')}:00`)
    options.push(`${String(hour).padStart(2, '0')}:30`)
  }
  return options
})()

type OpeningHoursRowLike = {
  opening_hours: Record<string, { slot_start_times?: SlotStartTimes | Record<string, string | undefined> | null } & Record<string, unknown>> | null
}

/**
 * 作品の開始時刻を、その日の店舗設定の各曜日ブロックへ上書きした「作品用の店舗設定」を返す。
 * 開始時刻だけを差し替えるので、営業日・受付する枠・休業日・前後の公演との間隔・終了上限・
 * 土日祝夜の開始下限などの判定は、店舗設定と同じ計算がそのまま効く（QW-20260909-011）。
 * 作品に設定のない枠と、店舗設定の無い店舗（仮の枠）はそのまま。
 */
export function applyScenarioSlotStartTimesToRow<T extends OpeningHoursRowLike>(
  row: T | undefined,
  times: ScenarioSlotStartTimes | null | undefined,
  isWeekendOrHoliday: boolean,
): T | undefined {
  if (!row?.opening_hours || !times) return row
  const picks: Partial<Record<SlotKey, string>> = {}
  for (const slot of ['morning', 'afternoon', 'evening'] as const) {
    const time = pickScenarioSlotStartTime(times, isWeekendOrHoliday, slot)
    if (time) picks[slot] = time
  }
  if (Object.keys(picks).length === 0) return row
  const openingHours: Record<string, unknown> = {}
  for (const [day, block] of Object.entries(row.opening_hours)) {
    openingHours[day] = block && typeof block === 'object'
      ? { ...block, slot_start_times: { ...(block.slot_start_times ?? {}), ...picks } }
      : block
  }
  return { ...row, opening_hours: openingHours as T['opening_hours'] }
}

/** 保存用。すべて「店舗設定」なら null（列を空のまま保つ） */
export function scenarioSlotStartTimesForSave(times: ScenarioSlotStartTimes | null | undefined): ScenarioSlotStartTimes | null {
  const serialized = serializeScenarioSlotStartTimes(times ?? {})
  const hasAny = [serialized.weekday, serialized.weekend].some(bucket => bucket && Object.values(bucket).some(Boolean))
  return hasAny ? serialized : null
}

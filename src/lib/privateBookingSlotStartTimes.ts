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

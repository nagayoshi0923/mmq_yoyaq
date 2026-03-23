import type { SupabaseClient } from '@supabase/supabase-js'
import { isJapaneseHoliday } from '@/utils/japaneseHolidays'
import { getDayOfWeekJST } from '@/utils/dateUtils'

/** PerformanceModal の calculateEndTime と同様、公演本体の所要時間のみ（分） */
export type ScenarioTimingInput = {
  duration: number
  weekend_duration?: number | null
}

/**
 * HH:mm または HH:mm:ss の開始時刻に分を加算（24h 内にクランプ）
 */
export function addMinutesToHHmm(start: string, minutes: number): string {
  const normalized = start.trim().slice(0, 8)
  const parts = normalized.split(':')
  const h = parseInt(parts[0] || '0', 10) || 0
  const m = parseInt(parts[1] || '0', 10) || 0
  let total = h * 60 + m + minutes
  total = ((total % (24 * 60)) + 24 * 60) % (24 * 60)
  const eh = Math.floor(total / 60) % 24
  const em = total % 60
  return `${String(eh).padStart(2, '0')}:${String(em).padStart(2, '0')}`
}

export function getPerformanceDurationMinutesForDate(
  dateStr: string,
  scenario: ScenarioTimingInput,
  isCustomHoliday: (d: string) => boolean
): number {
  const base = scenario.duration > 0 ? scenario.duration : 180
  const dow = getDayOfWeekJST(dateStr)
  const weekend = dow === 0 || dow === 6
  const holiday = isJapaneseHoliday(dateStr) || isCustomHoliday(dateStr)
  const wd = scenario.weekend_duration
  if ((weekend || holiday) && wd != null && wd > 0) {
    return wd
  }
  return base
}

/** 貸切候補の表示・承認用終了時刻（シナリオ公演時間に合わせる） */
export function getPrivateBookingDisplayEndTime(
  startTime: string,
  dateStr: string,
  scenario: ScenarioTimingInput,
  isCustomHoliday: (d: string) => boolean
): string {
  const mins = getPerformanceDurationMinutesForDate(dateStr, scenario, isCustomHoliday)
  return addMinutesToHHmm(startTime, mins)
}

export type ScenarioTimingFromDb = {
  duration: number
  weekend_duration: number | null
  /** 追加準備分。通常貸切と同様にインターバル60分に加算して空き判定する */
  extra_preparation_time: number
}

/** 通常貸切（usePrivateBooking）と同じく公演間に最低これだけ空ける（分） */
export const PRIVATE_BOOKING_EVENT_INTERVAL_MINUTES = 60

/**
 * 既存スケジュール上の公演と、貸切の占有 [perfStart, perfOccupancyEnd] が
 * 重なりまたはインターバル不足で両立しないか。
 *
 * perfOccupancyEnd = 開始 + 公演所要 + 追加準備（店舗占有が途切れる想定時刻）
 */
export function performanceConflictsWithScheduledEvent(
  perfStartMin: number,
  perfOccupancyEndMin: number,
  eventStartMin: number,
  eventEndMin: number,
  intervalMin: number = PRIVATE_BOOKING_EVENT_INTERVAL_MINUTES
): boolean {
  if (perfStartMin >= eventEndMin) {
    return perfStartMin < eventEndMin + intervalMin
  }
  if (perfOccupancyEndMin <= eventStartMin) {
    return perfOccupancyEndMin + intervalMin > eventStartMin
  }
  return true
}

/**
 * organization_scenarios を優先し、なければ scenario_masters.official_duration
 */
export async function fetchScenarioTimingFromDb(
  supabase: SupabaseClient,
  params: {
    organizationId: string | null | undefined
    /** private_groups.scenario_id / reservations.scenario_id 等 */
    scenarioLookupId: string | null | undefined
    scenarioMasterId?: string | null | undefined
  }
): Promise<ScenarioTimingFromDb> {
  const fallback = 180
  const { organizationId, scenarioLookupId, scenarioMasterId } = params
  const lookup = scenarioLookupId || scenarioMasterId
  if (!lookup) {
    return { duration: fallback, weekend_duration: null, extra_preparation_time: 0 }
  }

  if (organizationId) {
    const { data: os } = await supabase
      .from('organization_scenarios')
      .select('duration, weekend_duration, extra_preparation_time')
      .eq('organization_id', organizationId)
      .or(`id.eq.${lookup},scenario_master_id.eq.${lookup}`)
      .limit(1)
      .maybeSingle()

    if (os && typeof os.duration === 'number' && os.duration > 0) {
      const prep =
        typeof os.extra_preparation_time === 'number' && os.extra_preparation_time > 0
          ? os.extra_preparation_time
          : 0
      return {
        duration: os.duration,
        weekend_duration:
          typeof os.weekend_duration === 'number' && os.weekend_duration > 0
            ? os.weekend_duration
            : null,
        extra_preparation_time: prep,
      }
    }
  }

  const masterId = scenarioMasterId || lookup
  const { data: sm } = await supabase
    .from('scenario_masters')
    .select('official_duration, extra_preparation_time')
    .eq('id', masterId)
    .maybeSingle()

  if (sm && typeof sm.official_duration === 'number' && sm.official_duration > 0) {
    const prep =
      typeof sm.extra_preparation_time === 'number' && sm.extra_preparation_time > 0
        ? sm.extra_preparation_time
        : 0
    return { duration: sm.official_duration, weekend_duration: null, extra_preparation_time: prep }
  }

  return { duration: fallback, weekend_duration: null, extra_preparation_time: 0 }
}

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
    return { duration: fallback, weekend_duration: null }
  }

  if (organizationId) {
    const { data: os } = await supabase
      .from('organization_scenarios')
      .select('duration, weekend_duration')
      .eq('organization_id', organizationId)
      .or(`id.eq.${lookup},scenario_master_id.eq.${lookup}`)
      .limit(1)
      .maybeSingle()

    if (os && typeof os.duration === 'number' && os.duration > 0) {
      return {
        duration: os.duration,
        weekend_duration:
          typeof os.weekend_duration === 'number' && os.weekend_duration > 0
            ? os.weekend_duration
            : null,
      }
    }
  }

  const masterId = scenarioMasterId || lookup
  const { data: sm } = await supabase
    .from('scenario_masters')
    .select('official_duration')
    .eq('id', masterId)
    .maybeSingle()

  if (sm && typeof sm.official_duration === 'number' && sm.official_duration > 0) {
    return { duration: sm.official_duration, weekend_duration: null }
  }

  return { duration: fallback, weekend_duration: null }
}

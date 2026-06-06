/**
 * スケジュールの警告対象公演を集約する。
 *
 * - 未完了警告: シナリオ未定 / GM 未定 / メイン GM 不在
 * - 間隔警告: 同日同店舗で前後の公演と 60 分未満 (intervalWarningEventIds に含まれる ID)
 *
 * セル左ボーダー赤警告とカテゴリーバーの「警告:N」カウントの両方で参照する。
 */
import type { ScheduleEvent } from '@/types/schedule'

type StoreLike = { id: string; name?: string; short_name?: string | null }

export type ScheduleWarningReason = 'incomplete' | 'interval'

export interface ScheduleWarning {
  eventId: string
  date: string
  storeId: string
  storeName: string
  startTime: string
  endTime: string
  scenario: string
  reasons: ScheduleWarningReason[]
}

function isEventIncomplete(event: ScheduleEvent): boolean {
  const gms = event.gms ?? []
  if (!event.scenario || event.scenario.trim() === '') return true
  if (gms.length === 0) return true
  // メイン GM (gm_roles で 'main' か未指定) が 1 人も居ない
  const roles = event.gm_roles ?? {}
  const mainGmCount = gms.filter((g) => !roles[g] || roles[g] === 'main').length
  if (mainGmCount === 0) return true
  return false
}

export function computeScheduleWarnings(
  events: ScheduleEvent[],
  intervalWarningEventIds: Set<string>,
  stores: StoreLike[],
): ScheduleWarning[] {
  const storeMap = new Map(stores.map((s) => [s.id, s.short_name || s.name || '?']))
  const warnings: ScheduleWarning[] = []

  for (const ev of events) {
    if (ev.is_cancelled) continue
    const reasons: ScheduleWarningReason[] = []
    if (isEventIncomplete(ev)) reasons.push('incomplete')
    if (intervalWarningEventIds.has(ev.id)) reasons.push('interval')
    if (reasons.length === 0) continue
    warnings.push({
      eventId: ev.id,
      date: ev.date,
      storeId: ev.venue,
      storeName: storeMap.get(ev.venue) ?? '?',
      startTime: ev.start_time,
      endTime: ev.end_time,
      scenario: ev.scenario || '',
      reasons,
    })
  }

  warnings.sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? -1 : 1
    if (a.storeName !== b.storeName) return a.storeName < b.storeName ? -1 : 1
    return a.startTime < b.startTime ? -1 : a.startTime > b.startTime ? 1 : 0
  })

  return warnings
}

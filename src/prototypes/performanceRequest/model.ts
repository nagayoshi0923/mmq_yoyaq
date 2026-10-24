/**
 * 開催リクエスト（1 人からのオープン公演の開催希望）の試作の型と計算。
 *
 * 決まり（試作で確かめること）:
 * - リクエストは予約ではない。予約・席の確保・来店の義務・キャンセル料は発生しない。
 * - 参加希望人数は、公演の予約人数・残席・成立人数に加えない（公演の値は一切変えない）。
 * - 日付の指定が無い・曜日だけの希望も、月や店舗で絞ったときに消さず「日程未指定」に残す。
 */
import type { EventFormData, ScheduleEvent } from '@/types/schedule'
import { requestStoreIsEligible } from './requestSlots'
import { getTimeSlot } from '@/utils/scheduleUtils'
import type { ProtoScenario, ProtoStore } from './fixtures'

/** 送信の前に必ず出す注意文（文言を変えないこと。試験で一致を確かめている） */
export const REQUEST_NOT_RESERVATION_NOTICE =
  'リクエストは予約ではありません。開催・お席の確保をお約束するものではなく、公演公開後に別途ご予約が必要です'

export type RequestPeriod =
  | { kind: 'anytime' }
  | { kind: 'months'; months: string[] } // 'YYYY-MM'

export interface PerformanceRequest {
  id: string
  userId: string
  scenarioId: string
  /** 希望店舗（複数可） */
  storeIds: string[]
  /** 参加予定人数（予約人数ではない） */
  participants: number
  period: RequestPeriod
  /** 希望の曜日（0=日〜6=土）。空はどの曜日でも */
  weekdays: number[]
  /** 任意の日付の指定（'YYYY-MM-DD'） */
  dates: string[]
  timeSlots?: Array<'morning' | 'afternoon' | 'evening'>
  organizationId?: string
  createdAt: string
}

export type RequestStatus = 'open' | 'considering' | 'published'

export const REQUEST_STATUS_LABEL: Record<RequestStatus, string> = {
  open: '未対応',
  considering: '日程検討中',
  published: '公演公開済み',
}

export const WEEKDAY_LABELS = ['日', '月', '火', '水', '木', '金', '土'] as const

export function weekdayOf(date: string): number {
  const [y, m, d] = date.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay()
}

export function monthOf(date: string): string {
  return date.slice(0, 7)
}

export function formatMonthLabel(month: string): string {
  const [y, m] = month.split('-').map(Number)
  return `${y}年${m}月`
}

export function formatDateLabel(date: string): string {
  const [, m, d] = date.split('-').map(Number)
  return `${m}/${d}(${WEEKDAY_LABELS[weekdayOf(date)]})`
}

export function describePeriod(request: Pick<PerformanceRequest, 'period' | 'weekdays' | 'dates' | 'timeSlots'>): string {
  const parts: string[] = []
  if (request.period.kind === 'anytime') parts.push('いつでも')
  else parts.push(request.period.months.map(formatMonthLabel).join('・'))
  if (request.weekdays.length > 0) parts.push(`${request.weekdays.map((w) => WEEKDAY_LABELS[w]).join('・')}曜`)
  if (request.dates.length > 0) parts.push(`日付: ${request.dates.map(formatDateLabel).join('・')}`)
  if (request.timeSlots?.length) parts.push(`時間帯: ${request.timeSlots.map((s) => ({ morning: '午前', afternoon: '午後', evening: '夜' })[s]).join('・')}`)
  return parts.join(' / ')
}

/** その月に関係する希望か（いつでも／希望の月に含む／指定日がその月にある） */
export function requestMatchesMonth(request: PerformanceRequest, month: string): boolean {
  if (request.period.kind === 'anytime') return true
  if (request.period.months.includes(month)) return true
  return request.dates.some((d) => monthOf(d) === month)
}

/** 選んだ店舗に関係する希望か（店舗を選んでいなければすべて） */
export function requestMatchesStores(request: PerformanceRequest, storeIds: string[]): boolean {
  if (storeIds.length === 0) return true
  if (request.storeIds.length === 0) return storeIds.some((id) => requestStoreIsEligible(request, id, request.organizationId))
  return request.storeIds.some((id) => storeIds.includes(id))
}

/** その月の中の指定日（無ければ日程未指定） */
export function datesInMonth(request: PerformanceRequest, month: string): string[] {
  return request.dates.filter((d) => monthOf(d) === month).sort()
}

export interface RequestGroup {
  scenarioId: string
  /** 希望件数 */
  requestCount: number
  /** 参加希望人数の合計（予約人数ではない） */
  desiredParticipants: number
  /** 日付の指定がその月にある希望 */
  dated: PerformanceRequest[]
  /** 日付の指定が無い（曜日だけ・いつでも・月だけ）希望。絞り込みでも消さない */
  unscheduled: PerformanceRequest[]
  weekdayCounts: Record<number, number>
  requestedDates: string[]
  storeIds: string[]
}

/** 管理のサイドパネル用: 月と店舗で絞り、作品ごとにまとめる */
export function groupRequestsForPanel(requests: PerformanceRequest[], month: string, storeIds: string[]): RequestGroup[] {
  const groups = new Map<string, RequestGroup>()
  for (const request of requests) {
    if (!requestMatchesMonth(request, month) || !requestMatchesStores(request, storeIds)) continue
    let group = groups.get(request.scenarioId)
    if (!group) {
      group = { scenarioId: request.scenarioId, requestCount: 0, desiredParticipants: 0, dated: [], unscheduled: [], weekdayCounts: {}, requestedDates: [], storeIds: [] }
      groups.set(request.scenarioId, group)
    }
    group.requestCount += 1
    group.desiredParticipants += request.participants
    const inMonth = datesInMonth(request, month)
    if (inMonth.length > 0) group.dated.push(request)
    else group.unscheduled.push(request)
    for (const w of request.weekdays) group.weekdayCounts[w] = (group.weekdayCounts[w] ?? 0) + 1
    for (const d of inMonth) if (!group.requestedDates.includes(d)) group.requestedDates.push(d)
    for (const s of request.storeIds) if (!group.storeIds.includes(s)) group.storeIds.push(s)
  }
  for (const group of groups.values()) group.requestedDates.sort()
  return [...groups.values()].sort((a, b) => b.desiredParticipants - a.desiredParticipants || b.requestCount - a.requestCount)
}

/**
 * 「公演を作成」で公演ダイアログへ引き継ぐ下書き。架空データの組み立てだけで、保存はしない。
 * 定員・予約人数はリクエストから作らない（参加希望人数は予約人数ではない）。
 */
export function buildPerformanceDraft(
  group: RequestGroup,
  scenario: ProtoScenario,
  stores: ProtoStore[],
  month: string,
  preferredStoreIds: string[]
): EventFormData {
  const allowed = new Set(stores.map((s) => s.id))
  const requested = group.storeIds.filter((id) => allowed.has(id))
  const preferred = preferredStoreIds.filter((id) => allowed.has(id))
  const venue = requested.find((id) => preferred.includes(id)) ?? (requested.length ? requested[0] : preferred[0]) ?? stores[0]?.id ?? ''
  const date = group.requestedDates[0] ?? firstDateMatchingWeekdays(month, group.weekdayCounts)
  return {
    id: '',
    date,
    venue,
    scenario: scenario.title,
    category: 'open',
    start_time: '13:00',
    end_time: '16:30',
    max_participants: scenario.playerMax,
    capacity: 0,
    gms: [],
    gmRoles: {},
    notes: `開催リクエスト ${group.requestCount}件（参加希望 ${group.desiredParticipants}人）から作成（試作）。参加希望人数は予約人数に入りません。`,
  }
}

/** 曜日の希望が多い順で、その月の最初の該当日。曜日の希望が無ければ月の 1 日 */
export function firstDateMatchingWeekdays(month: string, weekdayCounts: Record<number, number>): string {
  const ranked = Object.entries(weekdayCounts).sort((a, b) => b[1] - a[1]).map(([w]) => Number(w))
  const [y, m] = month.split('-').map(Number)
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate()
  for (const w of ranked) {
    for (let d = 1; d <= days; d++) {
      const date = `${month}-${String(d).padStart(2, '0')}`
      if (weekdayOf(date) === w) return date
    }
  }
  return `${month}-01`
}

/**
 * スケジュール表のセルに出す公演（確定している公演だけ）。開催リクエストからは作らず、公演の値も変えない。
 */
export function eventsForSlot(events: ScheduleEvent[], date: string, venue: string, slot: 'morning' | 'afternoon' | 'evening'): ScheduleEvent[] {
  return events.filter((e) => e.date === date && e.venue === venue && getTimeSlot(e.start_time) === slot)
}

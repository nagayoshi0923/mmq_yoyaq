// api/schedule.ts の共通部分（CORS、定数、SELECT 文字列、型、定員の解決）（整備 Phase 3、#774。元の行をそのまま移した。ロジックの変更なし）
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { db } from '../db.js'

export const ALLOWED_ORIGINS = [
  process.env.ALLOWED_ORIGIN,
  'http://localhost:5173',
  'http://localhost:5174',
].filter(Boolean) as string[]

export function setCors(req: VercelRequest, res: VercelResponse) {
  const origin = req.headers.origin as string | undefined
  const allowed = origin && ALLOWED_ORIGINS.includes(origin) ? origin : (ALLOWED_ORIGINS[0] ?? '*')
  res.setHeader('Access-Control-Allow-Origin', allowed)
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type')
  res.setHeader('Access-Control-Allow-Credentials', 'true')
}

// ─── 共通定義 ─────────────────────────────────────────────────────────────

export const ACTIVE_RESERVATION_STATUSES = ['pending', 'confirmed', 'gm_confirmed', 'checked_in'] as const

export const ACTIVE_RESERVATION_STATUSES_SET = new Set<string>(ACTIVE_RESERVATION_STATUSES)

export const RESERVATION_SOURCE_WEB_PRIVATE = 'web_private'

// NOTE: schedule_events_staff_view ではなく schedule_events を直接参照する。
// 理由: スタッフ向けビューは `WHERE is_staff_or_admin()` で auth.uid() を見るが、
// この API ハンドラは service role で実行されるため auth.uid() が NULL になり
// ビュー越しでは常に 0 件しか返らない。本ハンドラは requireStaff(user) で既に
// スタッフ権限を確認しているので、ビューの追加チェックは不要。

// schedule_events から取得するカラム（getByMonth 用）
export const SCHEDULE_EVENT_MONTH_FIELDS =
  'id, date, start_time, end_time, venue, store_id, scenario, scenario_id, scenario_master_id, organization_scenario_id, category, is_cancelled, is_reservation_enabled, is_tentative, is_recruitment_extended, current_participants, max_participants, capacity, gms, gm_roles, notes, time_slot, organization_id, updated_at, reservation_name, reservation_id, is_reservation_name_overwritten'

// schedule_events から取得するネスト付き select（getByMonth 用）
export const SCHEDULE_EVENT_MONTH_SELECT = `
  ${SCHEDULE_EVENT_MONTH_FIELDS},
  stores:store_id (
    id,
    name,
    short_name,
    color
  ),
  scenario_masters:scenario_master_id (
    id,
    title,
    player_count_max
  )
`

// schedule_events から取得するネスト付き select（getMySchedule 用）
export const SCHEDULE_EVENT_MY_SELECT = `
  id, date, start_time, end_time, venue, store_id, scenario, scenario_id, scenario_master_id, organization_scenario_id, category, is_cancelled, is_reservation_enabled, is_tentative, current_participants, max_participants, capacity, gms, gm_roles, notes, time_slot, organization_id, updated_at,
  stores:store_id (
    id,
    name,
    short_name,
    color,
    address
  ),
  scenario_masters:scenario_master_id (
    id,
    title,
    player_count_max,
    official_duration,
    genre
  )
`

export const SCHEDULE_EVENT_DATE_RANGE_FIELDS =
  'id, date, venue, store_id, scenario, scenario_id, scenario_master_id, start_time, end_time, category, is_cancelled, is_private_request, current_participants, capacity, organization_id'

export const SCHEDULE_EVENT_BY_SCENARIO_SELECT = `
  id, date, start_time, end_time, time_slot,
  store_id, scenario_master_id, organization_scenario_id,
  category, is_cancelled, is_reservation_enabled,
  current_participants, max_participants, capacity, organization_id,
  stores:store_id (
    id,
    name,
    short_name,
    color
  ),
  scenario_masters:scenario_master_id (
    id,
    title,
    player_count_max
  )
`

// 確定貸切公演取得用（getByMonth 用）
export const PRIVATE_BOOKING_SELECT = `
  id,
  scenario_master_id,
  store_id,
  gm_staff,
  participant_count,
  candidate_datetimes,
  schedule_event_id,
  organization_id,
  scenario_masters:scenario_master_id (
    id,
    title,
    player_count_max
  ),
  stores:store_id (
    id,
    name,
    short_name,
    color,
    address
  )
`

// ─── 型 ──────────────────────────────────────────────────────────────────

export type CandidateDateTime = {
  order: number
  date: string
  startTime?: string
  endTime?: string
  status?: 'confirmed' | 'pending' | 'rejected'
  timeSlot?: string
}

export type ScheduleEventLike = {
  scenario_master_id?: string | null
  scenario?: string | null
  scenario_masters?: unknown
  max_participants?: number | null
  capacity?: number | null
}

// ─── ヘルパ ──────────────────────────────────────────────────────────────

/**
 * organization_scenarios_with_master ビューから player_count_max を取得し、
 * scenario_master_id と title の両方でルックアップできる Map を返す。
 */

export async function getOrgScenarioPlayerCounts(orgId: string): Promise<Map<string, number>> {
  if (!db) return new Map()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (db as any)
    .from('organization_scenarios_with_master')
    .select('id, title, player_count_max')
    .eq('organization_id', orgId)

  const map = new Map<string, number>()
  if (error) {
    console.error('[schedule] getOrgScenarioPlayerCounts error:', error)
    return map
  }
  if (data) {
    for (const row of data as Array<{ id: string; title: string; player_count_max: number }>) {
      if (row.player_count_max) {
        map.set(row.id, row.player_count_max)
        if (row.title) {
          map.set(row.title, row.player_count_max)
        }
      }
    }
  }
  return map
}

/**
 * イベントの正しい最大参加者数を解決する。
 * 優先順位: org override (by id) → org override (by title) → master JOIN → event fields → fallback
 */

export function resolveMaxParticipants(event: ScheduleEventLike, orgScenarioMap: Map<string, number>): number {
  if (event.scenario_master_id && orgScenarioMap.has(event.scenario_master_id)) {
    return orgScenarioMap.get(event.scenario_master_id)!
  }
  if (event.scenario && orgScenarioMap.has(event.scenario)) {
    return orgScenarioMap.get(event.scenario)!
  }
  const scenarioData = event.scenario_masters as { player_count_max?: number } | null
  if (scenarioData?.player_count_max) {
    return scenarioData.player_count_max
  }
  return event.max_participants || event.capacity || 8
}

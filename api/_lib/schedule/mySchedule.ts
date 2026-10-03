// api/schedule.ts の自分の予定（my-schedule）（整備 Phase 3、#774。元の行をそのまま移した。ロジックの変更なし）
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { db } from '../db.js'
import { type AuthUser } from '../auth.js'
import { SCHEDULE_EVENT_MY_SELECT, getOrgScenarioPlayerCounts, resolveMaxParticipants } from './common.js'

// ─── my-schedule (scheduleApi.getMySchedule) ─────────────────────────────
export async function handleMySchedule(req: VercelRequest, res: VercelResponse, user: AuthUser) {
  const staffName = req.query.staff_name as string | undefined
  const startDate = req.query.start as string | undefined
  const endDate = req.query.end as string | undefined
  if (!staffName || !startDate || !endDate) {
    return res.status(400).json({ error: 'staff_name / start / end クエリパラメータが必要です' })
  }

  // 1. GM として割り当てられた公演を取得
  const { data: gmEvents, error: gmError } = await db!
    .from('schedule_events')
    .select(SCHEDULE_EVENT_MY_SELECT)
    .eq('organization_id', user.orgId)
    .gte('date', startDate)
    .lte('date', endDate)
    .contains('gms', [staffName])
    .eq('is_cancelled', false)
    .order('date', { ascending: true })
    .order('start_time', { ascending: true })

  if (gmError) {
    console.error('[schedule] my-schedule gmEvents error:', gmError)
    return res.status(500).json({ error: 'データ取得に失敗しました', detail: gmError.message })
  }

  // 2. スタッフ参加（予約）として登録された公演を取得
  const { data: staffReservations, error: staffResError } = await db!
    .from('reservations')
    .select(`
      schedule_event_id,
      schedule_events!reservations_schedule_event_id_fkey!inner (
        ${SCHEDULE_EVENT_MY_SELECT}
      )
    `)
    .eq('organization_id', user.orgId)
    .contains('participant_names', [staffName])
    .eq('payment_method', 'staff')
    .in('status', ['confirmed', 'pending', 'gm_confirmed', 'checked_in'])

  if (staffResError) {
    console.error('[schedule] my-schedule staffReservations error:', staffResError)
  }

  type JoinedScheduleEvent = {
    id: string
    date: string
    start_time: string
    is_cancelled: boolean
    scenario_masters?: unknown
    max_participants?: number
    capacity?: number
    scenario?: string
    scenario_master_id?: string | null
    [key: string]: unknown
  }

  // 公演の結合は1件（多対一）。型推論は配列になるため実際の形で受ける
  const staffEvents: JoinedScheduleEvent[] = ((staffReservations || []) as unknown as Array<{ schedule_events: JoinedScheduleEvent | null }>)
    .map(r => r.schedule_events)
    .filter((event: JoinedScheduleEvent | null): event is JoinedScheduleEvent =>
      event !== null &&
      event.date >= startDate &&
      event.date <= endDate &&
      !event.is_cancelled
    )

  // 3. 重複排除
  const eventMap = new Map<string, JoinedScheduleEvent>()
  ;(gmEvents as JoinedScheduleEvent[] | null | undefined)?.forEach(event => eventMap.set(event.id, event))
  staffEvents.forEach(event => {
    if (event && !eventMap.has(event.id)) {
      eventMap.set(event.id, event)
    }
  })
  const scheduleEvents = Array.from(eventMap.values())

  // 4. 予約集計（参加者数）
  const eventIds = scheduleEvents.map(e => e.id)
  const reservationsMap = new Map<string, Array<{ participant_count: number }>>()

  if (eventIds.length > 0) {
    const BATCH_SIZE = 100
    const allReservations: Array<{ schedule_event_id: string; participant_count: number; status: string }> = []

    for (let i = 0; i < eventIds.length; i += BATCH_SIZE) {
      const batchIds = eventIds.slice(i, i + BATCH_SIZE)
      const { data, error: reservationError } = await db!
        .from('reservations')
        .select('schedule_event_id, participant_count, status')
        .eq('organization_id', user.orgId)
        .in('schedule_event_id', batchIds)
        .in('status', ['confirmed', 'pending', 'gm_confirmed', 'checked_in'])

      if (!reservationError && data) {
        allReservations.push(...(data as typeof allReservations))
      }
    }

    allReservations.forEach(reservation => {
      const eventId = reservation.schedule_event_id
      if (!reservationsMap.has(eventId)) {
        reservationsMap.set(eventId, [])
      }
      reservationsMap.get(eventId)!.push(reservation)
    })
  }

  const orgScenarioMap = await getOrgScenarioPlayerCounts(user.orgId)

  const myEvents = scheduleEvents.map(event => {
    const reservations = reservationsMap.get(event.id) || []
    const actualParticipants = reservations.reduce((sum, r) => sum + (r.participant_count || 0), 0)
    const maxParticipants = resolveMaxParticipants(event, orgScenarioMap)

    return {
      ...event,
      current_participants: actualParticipants,
      max_participants: maxParticipants,
      capacity: maxParticipants,
      is_private_booking: false,
    }
  })

  // 日付・時間順でソート
  myEvents.sort((a, b) => {
    if (a.date !== b.date) return a.date.localeCompare(b.date)
    return a.start_time.localeCompare(b.start_time)
  })

  return res.status(200).json(myEvents)
}

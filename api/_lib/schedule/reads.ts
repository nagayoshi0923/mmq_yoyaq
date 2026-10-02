// api/schedule.ts の期間別・作品別の読み取り（by-date-range / by-scenario）（整備 Phase 3、#774。元の行をそのまま移した。ロジックの変更なし）
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { db } from '../db.js'
import { type AuthUser } from '../auth.js'
import { SCHEDULE_EVENT_DATE_RANGE_FIELDS, SCHEDULE_EVENT_BY_SCENARIO_SELECT, getOrgScenarioPlayerCounts, resolveMaxParticipants } from './common.js'

// ─── by-date-range (scheduleApi.getByDateRange) ──────────────────────────
export async function handleByDateRange(req: VercelRequest, res: VercelResponse, user: AuthUser) {
  const startDate = req.query.start as string | undefined
  const endDate = req.query.end as string | undefined
  const includeCancelled = req.query.include_cancelled === 'true'

  if (!startDate || !endDate) {
    return res.status(400).json({ error: 'start / end クエリパラメータが必要です' })
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let query: any = (db as any)
    .from('schedule_events')
    .select(SCHEDULE_EVENT_DATE_RANGE_FIELDS)
    .eq('organization_id', user.orgId)
    .gte('date', startDate)
    .lte('date', endDate)
    .order('date')
    .order('start_time')

  if (!includeCancelled) {
    query = query.eq('is_cancelled', false)
  }

  const { data, error } = await query

  if (error) {
    console.error('[schedule] by-date-range error:', error)
    return res.status(500).json({ error: 'データ取得に失敗しました', detail: error.message })
  }

  return res.status(200).json(data ?? [])
}

// ─── by-scenario (scheduleApi.getByScenarioId) ───────────────────────────
export async function handleByScenario(req: VercelRequest, res: VercelResponse, user: AuthUser) {
  const scenarioId = req.query.scenario_id as string | undefined
  const startDate = req.query.start as string | undefined
  const endDate = req.query.end as string | undefined

  if (!scenarioId || !startDate || !endDate) {
    return res.status(400).json({ error: 'scenario_id / start / end クエリパラメータが必要です' })
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: scheduleEventsRaw, error } = await (db as any)
    .from('schedule_events')
    .select(SCHEDULE_EVENT_BY_SCENARIO_SELECT)
    .eq('organization_id', user.orgId)
    .eq('scenario_master_id', scenarioId)
    .gte('date', startDate)
    .lte('date', endDate)
    .in('category', ['open', 'offsite'])
    .eq('is_reservation_enabled', true)
    .eq('is_cancelled', false)
    .order('date', { ascending: true })
    .order('start_time', { ascending: true })

  if (error) {
    console.error('[schedule] by-scenario error:', error)
    return res.status(500).json({ error: 'データ取得に失敗しました', detail: error.message })
  }

  const scheduleEvents = (scheduleEventsRaw as Array<Record<string, unknown> & {
    id: string
    time_slot?: string | null
    current_participants?: number
    scenario_master_id?: string | null
    scenario?: string | null
    scenario_masters?: unknown
    max_participants?: number | null
    capacity?: number | null
  }>) ?? []

  if (scheduleEvents.length === 0) {
    return res.status(200).json([])
  }

  const eventIds = scheduleEvents.map(e => e.id)

  // 予約集計（バッチ）
  const BATCH_SIZE = 100
  const allReservations: Array<{ schedule_event_id: string; participant_count: number }> = []

  for (let i = 0; i < eventIds.length; i += BATCH_SIZE) {
    const batchIds = eventIds.slice(i, i + BATCH_SIZE)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error: reservationError } = await (db as any)
      .from('reservations')
      .select('schedule_event_id, participant_count')
      .eq('organization_id', user.orgId)
      .in('schedule_event_id', batchIds)
      .in('status', ['confirmed', 'pending', 'gm_confirmed', 'checked_in'])

    if (reservationError && reservationError.code !== 'PGRST116') {
      console.warn('[schedule] by-scenario reservation error:', reservationError)
    }
    if (data) {
      allReservations.push(...(data as typeof allReservations))
    }
  }

  const participantsByEventId = new Map<string, number>()
  allReservations.forEach(reservation => {
    const eventId = reservation.schedule_event_id
    const count = reservation.participant_count || 0
    participantsByEventId.set(eventId, (participantsByEventId.get(eventId) || 0) + count)
  })

  const orgScenarioMap = await getOrgScenarioPlayerCounts(user.orgId)

  const eventsWithActualParticipants = scheduleEvents.map(event => {
    const actualParticipants = participantsByEventId.get(event.id) || 0

    // current_participants は DB トリガー（trigger_recalc_participants）が予約変更時に同期するため、
    // 読み取り時の書き戻しはしない（Realtime エコーで全クライアントの再フェッチを誘発していた）

    const maxParticipants = resolveMaxParticipants(event, orgScenarioMap)
    const effectiveParticipants = Math.max(actualParticipants, event.current_participants || 0)

    return {
      ...event,
      current_participants: effectiveParticipants,
      max_participants: maxParticipants,
      capacity: maxParticipants,
      is_private_booking: false,
      ...(event.time_slot && { timeSlot: event.time_slot }),
    }
  })

  return res.status(200).json(eventsWithActualParticipants)
}

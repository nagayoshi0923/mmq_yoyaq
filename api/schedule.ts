import type { VercelRequest, VercelResponse } from '@vercel/node'
import { db, getMissingEnvError } from './_lib/db.js'
import { requireAuth, requireStaff, ApiError, type AuthUser } from './_lib/auth.js'

const ALLOWED_ORIGINS = [
  process.env.ALLOWED_ORIGIN,
  'http://localhost:5173',
  'http://localhost:5174',
].filter(Boolean) as string[]

function setCors(req: VercelRequest, res: VercelResponse) {
  const origin = req.headers.origin as string | undefined
  const allowed = origin && ALLOWED_ORIGINS.includes(origin) ? origin : (ALLOWED_ORIGINS[0] ?? '*')
  res.setHeader('Access-Control-Allow-Origin', allowed)
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type')
  res.setHeader('Access-Control-Allow-Credentials', 'true')
}

// ─── 共通定義 ─────────────────────────────────────────────────────────────

const ACTIVE_RESERVATION_STATUSES = ['pending', 'confirmed', 'gm_confirmed', 'checked_in'] as const
const ACTIVE_RESERVATION_STATUSES_SET = new Set<string>(ACTIVE_RESERVATION_STATUSES)
const RESERVATION_SOURCE_WEB_PRIVATE = 'web_private'

// schedule_events_staff_view から取得するカラム（getByMonth 用）
const SCHEDULE_EVENT_MONTH_FIELDS =
  'id, date, start_time, end_time, venue, store_id, scenario, scenario_id, scenario_master_id, organization_scenario_id, category, is_cancelled, is_reservation_enabled, is_tentative, is_recruitment_extended, current_participants, max_participants, capacity, gms, gm_roles, notes, time_slot, organization_id, updated_at, reservation_name, reservation_id, is_reservation_name_overwritten'

// schedule_events_staff_view から取得するネスト付き select（getByMonth 用）
const SCHEDULE_EVENT_MONTH_SELECT = `
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

// schedule_events_staff_view から取得するネスト付き select（getMySchedule 用）
const SCHEDULE_EVENT_MY_SELECT = `
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

const SCHEDULE_EVENT_DATE_RANGE_FIELDS =
  'id, date, venue, store_id, scenario, scenario_id, scenario_master_id, start_time, end_time, category, is_cancelled, current_participants, capacity, organization_id'

const SCHEDULE_EVENT_BY_SCENARIO_SELECT = `
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
const PRIVATE_BOOKING_SELECT = `
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

type CandidateDateTime = {
  order: number
  date: string
  startTime?: string
  endTime?: string
  status?: 'confirmed' | 'pending' | 'rejected'
  timeSlot?: string
}

type ScheduleEventLike = {
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
async function getOrgScenarioPlayerCounts(orgId: string): Promise<Map<string, number>> {
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
function resolveMaxParticipants(event: ScheduleEventLike, orgScenarioMap: Map<string, number>): number {
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

// ─── エントリポイント ────────────────────────────────────────────────────

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCors(req, res)
  if (req.method === 'OPTIONS') return res.status(204).end()
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  const envError = getMissingEnvError()
  if (envError || !db) return res.status(500).json({ error: `環境変数が未設定です: ${envError}` })

  const type = req.query.type as string | undefined
  if (!type) {
    return res.status(400).json({ error: 'type クエリパラメータが必要です' })
  }

  try {
    const user = await requireAuth(req)
    requireStaff(user)

    switch (type) {
      case 'my-schedule':
        return await handleMySchedule(req, res, user)
      case 'by-month':
        return await handleByMonth(req, res, user)
      case 'by-date-range':
        return await handleByDateRange(req, res, user)
      case 'by-scenario':
        return await handleByScenario(req, res, user)
      default:
        return res.status(400).json({ error: `未対応の type: ${type}` })
    }
  } catch (err) {
    if (err instanceof ApiError) return res.status(err.status).json({ error: err.message })
    console.error('[schedule] unexpected error:', err)
    return res.status(500).json({ error: 'サーバーエラーが発生しました' })
  }
}

// ─── my-schedule (scheduleApi.getMySchedule) ─────────────────────────────
async function handleMySchedule(req: VercelRequest, res: VercelResponse, user: AuthUser) {
  const staffName = req.query.staff_name as string | undefined
  const startDate = req.query.start as string | undefined
  const endDate = req.query.end as string | undefined
  if (!staffName || !startDate || !endDate) {
    return res.status(400).json({ error: 'staff_name / start / end クエリパラメータが必要です' })
  }

  // 1. GM として割り当てられた公演を取得
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: gmEvents, error: gmError } = await (db as any)
    .from('schedule_events_staff_view')
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: staffReservations, error: staffResError } = await (db as any)
    .from('reservations')
    .select(`
      schedule_event_id,
      schedule_events!inner (
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

  const staffEvents: JoinedScheduleEvent[] = (staffReservations || [])
    .map((r: { schedule_events: JoinedScheduleEvent | null }) => r.schedule_events as JoinedScheduleEvent | null)
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
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error: reservationError } = await (db as any)
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

// ─── by-month (scheduleApi.getByMonth) ───────────────────────────────────
async function handleByMonth(req: VercelRequest, res: VercelResponse, user: AuthUser) {
  const year = Number(req.query.year)
  const month = Number(req.query.month)
  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
    return res.status(400).json({ error: 'year / month クエリパラメータが必要です' })
  }
  const skipPrivateBookings = req.query.skip_private_bookings === 'true'

  const startDate = `${year}-${String(month).padStart(2, '0')}-01`
  const lastDay = new Date(year, month, 0).getDate()
  const endDate = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`

  // 通常公演を取得
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: scheduleEventsRaw, error } = await (db as any)
    .from('schedule_events_staff_view')
    .select(SCHEDULE_EVENT_MONTH_SELECT)
    .eq('organization_id', user.orgId)
    .gte('date', startDate)
    .lte('date', endDate)
    .order('date', { ascending: true })
    .order('start_time', { ascending: true })

  if (error) {
    console.error('[schedule] by-month events error:', error)
    return res.status(500).json({ error: 'データ取得に失敗しました', detail: error.message })
  }

  const scheduleEvents = (scheduleEventsRaw as Array<Record<string, unknown> & {
    id: string
    date: string
    start_time: string
    is_cancelled?: boolean
    current_participants?: number
    category?: string
    time_slot?: string
    scenario_master_id?: string | null
    scenario?: string | null
    scenario_masters?: unknown
    max_participants?: number | null
    capacity?: number | null
  }>) ?? []

  // 予約集計
  const eventIds = scheduleEvents.map(e => e.id)
  const reservationsMap = new Map<
    string,
    Array<{
      participant_count: number
      status?: string
      candidate_datetimes?: { candidates?: Array<{ status?: string; timeSlot?: string }> }
      reservation_source?: string
    }>
  >()

  const BATCH_SIZE = 100
  const batches: string[][] = []
  for (let i = 0; i < eventIds.length; i += BATCH_SIZE) {
    batches.push(eventIds.slice(i, i + BATCH_SIZE))
  }

  const [batchResults, orgScenarioMap] = await Promise.all([
    Promise.all(
      batches.map(batchIds =>
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (db as any)
          .from('reservations')
          .select('schedule_event_id, participant_count, status, candidate_datetimes, reservation_source')
          .eq('organization_id', user.orgId)
          .in('schedule_event_id', batchIds)
      )
    ),
    getOrgScenarioPlayerCounts(user.orgId),
  ])

  batchResults.forEach(({ data: batchReservations, error: reservationError }: { data: Array<Record<string, unknown>> | null; error: { message?: string } | null }) => {
    if (!reservationError && batchReservations) {
      batchReservations.forEach((reservation: Record<string, unknown>) => {
        const eventId = reservation.schedule_event_id as string
        if (!reservationsMap.has(eventId)) {
          reservationsMap.set(eventId, [])
        }
        reservationsMap.get(eventId)!.push(reservation as Parameters<typeof reservationsMap.get>[0] extends string ? never : Parameters<typeof reservationsMap.set>[1][number])
      })
    }
  })

  // 各イベントを enrich
  const eventsWithActualParticipants = scheduleEvents.map(event => {
    const reservations = reservationsMap.get(event.id) || []
    const hasAnyReservations = reservations.length > 0

    const actualParticipants = event.is_cancelled
      ? reservations.reduce((sum, r) => sum + (r.participant_count || 0), 0)
      : reservations.reduce((sum, reservation) => {
          if (!reservation.status || !ACTIVE_RESERVATION_STATUSES_SET.has(reservation.status)) return sum
          return sum + (reservation.participant_count || 0)
        }, 0)

    let timeSlot: string | undefined
    let isPrivateBooking = false

    if (event.time_slot) {
      timeSlot = event.time_slot
    }

    if (event.category === 'private') {
      isPrivateBooking = true
      if (!timeSlot) {
        const privateReservation = reservations.find(r => r.reservation_source === RESERVATION_SOURCE_WEB_PRIVATE)
        if (privateReservation?.candidate_datetimes?.candidates) {
          const confirmedCandidate = privateReservation.candidate_datetimes.candidates.find(c => c.status === 'confirmed')
          if (confirmedCandidate?.timeSlot) {
            timeSlot = confirmedCandidate.timeSlot
          } else if (privateReservation.candidate_datetimes.candidates[0]?.timeSlot) {
            timeSlot = privateReservation.candidate_datetimes.candidates[0].timeSlot
          }
        }
      }
    }

    const maxForSync = resolveMaxParticipants(event, orgScenarioMap)
    const cappedActualParticipants = Math.min(actualParticipants, maxForSync)

    // current_participants 同期（バックグラウンドで実行・エラーは握る）
    if (!event.is_cancelled && hasAnyReservations && cappedActualParticipants !== (event.current_participants || 0)) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      Promise.resolve(
        (db as any)
          .from('schedule_events')
          .update({ current_participants: cappedActualParticipants })
          .eq('id', event.id)
      ).catch((syncError: unknown) => {
        console.error('[schedule] by-month sync error:', syncError)
      })
    }

    const maxParticipants = maxForSync
    const effectiveParticipants = event.is_cancelled
      ? Math.max(cappedActualParticipants, Math.min(event.current_participants || 0, maxParticipants))
      : (hasAnyReservations
          ? cappedActualParticipants
          : Math.min(event.current_participants || 0, maxParticipants))

    return {
      ...event,
      current_participants: effectiveParticipants,
      max_participants: maxParticipants,
      capacity: maxParticipants,
      is_private_booking: isPrivateBooking,
      ...(timeSlot && { timeSlot }),
    }
  })

  // 確定した貸切公演を取得
  type PrivateEvent = {
    id: string
    date: string
    venue: string
    store_id: string
    scenario: string
    scenario_master_id?: string
    start_time: string
    end_time: string
    category: string
    is_cancelled: boolean
    is_reservation_enabled: boolean
    current_participants: number
    max_participants: number
    capacity: number
    gms: string[]
    gm_roles?: Record<string, string>
    stores?: unknown
    scenarios?: unknown
    is_private_booking?: boolean
    timeSlot?: string
  }
  const privateEvents: PrivateEvent[] = []

  if (!skipPrivateBookings) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: confirmedPrivateBookings, error: privateError } = await (db as any)
      .from('reservations')
      .select(PRIVATE_BOOKING_SELECT)
      .eq('organization_id', user.orgId)
      .eq('reservation_source', RESERVATION_SOURCE_WEB_PRIVATE)
      .eq('status', 'confirmed')
      .is('schedule_event_id', null)

    if (privateError) {
      console.error('[schedule] by-month private bookings error:', privateError)
    }

    if (confirmedPrivateBookings) {
      type PrivateBooking = {
        id: string
        scenario_master_id: string | null
        store_id: string
        gm_staff?: string | null
        participant_count: number
        candidate_datetimes?: { candidates?: CandidateDateTime[] } | null
        scenario_masters?: { id?: string; title?: string; player_count_max?: number } | Array<{ id?: string; title?: string; player_count_max?: number }> | null
        stores?: unknown
      }

      const bookings = confirmedPrivateBookings as PrivateBooking[]
      const gmStaffIds = bookings
        .map(b => b.gm_staff)
        .filter((id): id is string => !!id)

      const uniqueGmStaffIds = [...new Set(gmStaffIds)]
      const gmStaffMap = new Map<string, string>()

      if (uniqueGmStaffIds.length > 0) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: gmStaffList } = await (db as any)
          .from('staff')
          .select('id, name')
          .eq('organization_id', user.orgId)
          .in('id', uniqueGmStaffIds)

        if (gmStaffList) {
          for (const staff of gmStaffList as Array<{ id: string; name: string }>) {
            gmStaffMap.set(staff.id, staff.name)
          }
        }
      }

      for (const booking of bookings) {
        if (booking.candidate_datetimes?.candidates) {
          const confirmedCandidates = booking.candidate_datetimes.candidates.filter(c => c.status === 'confirmed')
          const candidatesToShow = confirmedCandidates.length > 0
            ? confirmedCandidates.slice(0, 1)
            : booking.candidate_datetimes.candidates.slice(0, 1)

          for (const candidate of candidatesToShow) {
            const candidateDate = new Date(candidate.date)
            const candidateDateStr = candidateDate.toISOString().split('T')[0]

            if (candidateDateStr >= startDate && candidateDateStr <= endDate) {
              const candidateStartTime = candidate.startTime || '18:00:00'
              const candidateEndTime = candidate.endTime || '21:00:00'

              let gmNames: string[] = []
              if (booking.gm_staff && gmStaffMap.has(booking.gm_staff)) {
                gmNames = [gmStaffMap.get(booking.gm_staff)!]
              }
              if (gmNames.length === 0) {
                gmNames = ['未定']
              }

              const scenarioData = Array.isArray(booking.scenario_masters)
                ? booking.scenario_masters[0]
                : booking.scenario_masters
              const candidateTimeSlot = candidate.timeSlot || ''

              const privateMaxParticipants = resolveMaxParticipants(
                {
                  scenario_master_id: scenarioData?.id,
                  scenario: scenarioData?.title,
                  scenario_masters: scenarioData,
                },
                orgScenarioMap
              )

              privateEvents.push({
                id: `private-${booking.id}-${candidate.order}`,
                date: candidateDateStr,
                venue: booking.store_id,
                store_id: booking.store_id,
                scenario: scenarioData?.title || '',
                scenario_master_id: booking.scenario_master_id ?? undefined,
                start_time: candidateStartTime,
                end_time: candidateEndTime,
                category: 'private',
                is_cancelled: false,
                is_reservation_enabled: true,
                current_participants: booking.participant_count,
                max_participants: privateMaxParticipants,
                capacity: privateMaxParticipants,
                gms: gmNames,
                stores: booking.stores,
                scenarios: scenarioData,
                is_private_booking: true,
                timeSlot: candidateTimeSlot,
              })
            }
          }
        }
      }
    }
  }

  const allEvents = [...eventsWithActualParticipants, ...privateEvents]
  allEvents.sort((a, b) => {
    const dateCompare = a.date.localeCompare(b.date)
    if (dateCompare !== 0) return dateCompare
    return a.start_time.localeCompare(b.start_time)
  })

  return res.status(200).json(allEvents)
}

// ─── by-date-range (scheduleApi.getByDateRange) ──────────────────────────
async function handleByDateRange(req: VercelRequest, res: VercelResponse, user: AuthUser) {
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
async function handleByScenario(req: VercelRequest, res: VercelResponse, user: AuthUser) {
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
    const shouldUpdate = actualParticipants > (event.current_participants || 0)

    if (shouldUpdate) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      Promise.resolve(
        (db as any)
          .from('schedule_events')
          .update({ current_participants: actualParticipants })
          .eq('id', event.id)
      ).catch((syncError: unknown) => {
        console.error('[schedule] by-scenario sync error:', syncError)
      })
    }

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

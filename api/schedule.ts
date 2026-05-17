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
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type')
  res.setHeader('Access-Control-Allow-Credentials', 'true')
}

// ─── 共通定義 ─────────────────────────────────────────────────────────────

const ACTIVE_RESERVATION_STATUSES = ['pending', 'confirmed', 'gm_confirmed', 'checked_in'] as const
const ACTIVE_RESERVATION_STATUSES_SET = new Set<string>(ACTIVE_RESERVATION_STATUSES)
const RESERVATION_SOURCE_WEB_PRIVATE = 'web_private'

// NOTE: schedule_events_staff_view ではなく schedule_events を直接参照する。
// 理由: スタッフ向けビューは `WHERE is_staff_or_admin()` で auth.uid() を見るが、
// この API ハンドラは service role で実行されるため auth.uid() が NULL になり
// ビュー越しでは常に 0 件しか返らない。本ハンドラは requireStaff(user) で既に
// スタッフ権限を確認しているので、ビューの追加チェックは不要。

// schedule_events から取得するカラム（getByMonth 用）
const SCHEDULE_EVENT_MONTH_FIELDS =
  'id, date, start_time, end_time, venue, store_id, scenario, scenario_id, scenario_master_id, organization_scenario_id, category, is_cancelled, is_reservation_enabled, is_tentative, is_recruitment_extended, current_participants, max_participants, capacity, gms, gm_roles, notes, time_slot, organization_id, updated_at, reservation_name, reservation_id, is_reservation_name_overwritten'

// schedule_events から取得するネスト付き select（getByMonth 用）
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

// schedule_events から取得するネスト付き select（getMySchedule 用）
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

  const envError = getMissingEnvError()
  if (envError || !db) return res.status(500).json({ error: `環境変数が未設定です: ${envError}` })

  try {
    const user = await requireAuth(req)
    requireStaff(user)

    if (req.method === 'GET') return await handleGet(req, res, user)
    if (req.method === 'POST') return await handlePost(req, res, user)
    if (req.method === 'PATCH') return await handlePatch(req, res, user)
    if (req.method === 'DELETE') return await handleDelete(req, res, user)
    return res.status(405).json({ error: 'Method not allowed' })
  } catch (err) {
    if (err instanceof ApiError) return res.status(err.status).json({ error: err.message })
    console.error('[schedule] unexpected error:', err)
    return res.status(500).json({ error: 'サーバーエラーが発生しました' })
  }
}

async function handleGet(req: VercelRequest, res: VercelResponse, user: AuthUser) {
  const type = req.query.type as string | undefined
  if (!type) {
    return res.status(400).json({ error: 'type クエリパラメータが必要です' })
  }
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
}

async function handlePost(req: VercelRequest, res: VercelResponse, user: AuthUser) {
  const action = req.query.action as string | undefined
  if (action === 'add-demo-participants') return await handleAddDemoParticipants(req, res, user)
  if (action === 'remove-demo-reservations') return await handleRemoveDemoReservations(req, res, user)
  return await handleCreate(req, res, user)
}

async function handlePatch(req: VercelRequest, res: VercelResponse, user: AuthUser) {
  const action = req.query.action as string | undefined
  if (action === 'toggle-cancel') return await handleToggleCancel(req, res, user)
  return await handleUpdate(req, res, user)
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
    .from('schedule_events')
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

// ─── write 系ヘルパ ────────────────────────────────────────────────────

// DB で許可されているカテゴリ（チェック制約に合わせる）
const DB_VALID_CATEGORIES = ['open', 'private', 'gmtest', 'testplay', 'offsite', 'venue_rental', 'venue_rental_free', 'package', 'mtg']

// 作成可能フィールドのホワイトリスト（Mass Assignment 防止）
const SCHEDULE_CREATABLE_FIELDS = [
  'date', 'store_id', 'venue', 'scenario', 'scenario_master_id', 'organization_scenario_id',
  'category', 'start_time', 'end_time', 'capacity', 'gms', 'gm_roles', 'notes',
  'time_slot', 'is_reservation_enabled', 'is_tentative', 'venue_rental_fee',
  'reservation_name', 'is_reservation_name_overwritten', 'is_private_request', 'reservation_id',
] as const

const SCHEDULE_UPDATABLE_FIELDS = [
  ...SCHEDULE_CREATABLE_FIELDS,
  'is_cancelled', 'cancellation_reason', 'cancelled_at',
] as const

function pickFields<T extends readonly string[]>(
  src: Record<string, unknown>,
  allowed: T,
): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const key of Object.keys(src)) {
    if ((allowed as readonly string[]).includes(key)) {
      out[key] = src[key]
    }
  }
  return out
}

function normalizeScenarioName(name: string): string {
  return name
    .replace(/^["「『📗📕]/, '')
    .replace(/["」』]$/, '')
    .replace(/^貸・/, '')
    .replace(/^募・/, '')
    .replace(/^🈵・/, '')
    .replace(/^GMテスト・/, '')
    .replace(/^打診・/, '')
    .replace(/^仮/, '')
    .replace(/^（仮）/, '')
    .replace(/^\(仮\)/, '')
    .replace(/\(.*?\)$/, '')
    .replace(/（.*?）$/, '')
    .trim()
}

function removeMissingScheduleColumn(
  payload: Record<string, unknown>,
  error: { message?: string; details?: string; hint?: string } | null,
): { nextPayload: Record<string, unknown>; removedColumn: string } | null {
  if (!error) return null
  const combined = `${error.message ?? ''} ${error.details ?? ''} ${error.hint ?? ''}`
  const patterns = [
    /column "([^"]+)" of relation "schedule_events" does not exist/i,
    /Could not find the '([^']+)' column of 'schedule_events'/i,
  ]
  for (const pattern of patterns) {
    const match = combined.match(pattern)
    if (match?.[1]) {
      const missingColumn = match[1]
      if (missingColumn in payload) {
        const nextPayload = { ...payload }
        delete nextPayload[missingColumn]
        return { nextPayload, removedColumn: missingColumn }
      }
    }
  }
  return null
}

async function findMatchingScenario(scenarioName: string | undefined): Promise<{ id: string; title: string } | null> {
  if (!scenarioName || scenarioName.trim() === '') return null
  if (!db) return null
  const cleanName = normalizeScenarioName(scenarioName)
  if (cleanName.length < 2) return null

  // エイリアスマッピングを取得
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: aliasRows } = await (db as any)
    .from('scenario_import_aliases')
    .select('alias, canonical_name')
  const aliasMap: Record<string, string> = {}
  for (const row of (aliasRows as Array<{ alias: string; canonical_name: string }> | null) ?? []) {
    aliasMap[row.alias] = row.canonical_name
  }

  let searchName = aliasMap[cleanName] ?? cleanName
  if (searchName === cleanName) {
    for (const [alias, formal] of Object.entries(aliasMap)) {
      if (cleanName.includes(alias)) {
        searchName = formal
        break
      }
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: scenarios } = await (db as any)
    .from('scenario_masters')
    .select('id, title')
  if (!scenarios || scenarios.length === 0) return null

  type ScenarioMasterRow = { id: string; title: string }
  const rows = scenarios as ScenarioMasterRow[]
  let match: ScenarioMasterRow | undefined = rows.find(s => s.title === searchName)
  if (!match) match = rows.find(s => s.title.startsWith(searchName))
  if (!match) match = rows.find(s => searchName.includes(s.title))
  if (!match && searchName.length >= 4) match = rows.find(s => s.title.includes(searchName))
  return match || null
}

// INSERT/UPDATE 後にスタッフ専用ビューから完全レコードを取得する
const SCHEDULE_EVENT_FULL_SELECT = `
  *,
  stores:store_id (
    id,
    name,
    short_name
  ),
  scenario_masters:scenario_master_id (
    id,
    title,
    player_count_max
  )
`

// ─── handleCreate (POST) ─────────────────────────────────────────────────
async function handleCreate(req: VercelRequest, res: VercelResponse, user: AuthUser) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const database = db as any
  const body = (req.body ?? {}) as Record<string, unknown>

  // ホワイトリスト + サーバ強制
  const insertRow = pickFields(body, SCHEDULE_CREATABLE_FIELDS)
  insertRow.organization_id = user.orgId // ← クライアント値は使わずサーバ強制

  if (!insertRow.date || !insertRow.store_id || !insertRow.category || !insertRow.start_time || !insertRow.end_time) {
    return res.status(400).json({ error: 'date / store_id / category / start_time / end_time は必須です' })
  }

  // 自組織の店舗かを確認
  const { data: storeRow, error: storeErr } = await database
    .from('stores')
    .select('id, organization_id')
    .eq('id', insertRow.store_id)
    .maybeSingle()
  if (storeErr) {
    console.error('[schedule:create] store lookup error:', storeErr)
    return res.status(500).json({ error: '店舗確認に失敗しました' })
  }
  if (!storeRow) return res.status(404).json({ error: '店舗が見つかりません' })
  if (storeRow.organization_id !== user.orgId) {
    return res.status(403).json({ error: '他組織の店舗は使用できません' })
  }

  // シナリオ名から自動マッチング
  const scenarioInput = typeof insertRow.scenario === 'string' ? insertRow.scenario : undefined
  if (scenarioInput && !insertRow.scenario_master_id) {
    const match = await findMatchingScenario(scenarioInput)
    if (match) {
      insertRow.scenario_master_id = match.id
      insertRow.scenario = match.title
    }
  }

  // organization_scenario_id を自動設定（scenario_master_id 経由）
  if (insertRow.scenario_master_id && !insertRow.organization_scenario_id) {
    const { data: orgScenario } = await database
      .from('organization_scenarios')
      .select('id')
      .eq('scenario_master_id', insertRow.scenario_master_id as string)
      .eq('organization_id', user.orgId)
      .maybeSingle()
    if (orgScenario?.id) {
      insertRow.organization_scenario_id = orgScenario.id
    }
  }

  // カテゴリのバリデーション
  if (typeof insertRow.category === 'string' && !DB_VALID_CATEGORIES.includes(insertRow.category)) {
    insertRow.category = 'open'
  }

  // INSERT（不明カラムをリトライ削除）
  let insertPayload: Record<string, unknown> = { ...insertRow }
  let lastError: { message?: string; details?: string; hint?: string; code?: string } | null = null
  let insertedId: string | null = null
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const { data, error } = await database
      .from('schedule_events')
      .insert([insertPayload])
      .select('id')
      .single()
    if (!error) {
      insertedId = data.id as string
      break
    }
    lastError = error
    const removal = removeMissingScheduleColumn(insertPayload, error)
    if (!removal) break
    insertPayload = removal.nextPayload
  }

  if (!insertedId) {
    console.error('[schedule:create] insert error:', lastError)
    return res.status(500).json({ error: '公演の作成に失敗しました', detail: lastError?.message })
  }

  // スタッフ専用ビューから完全レコードを返す
  const { data: fullEvent, error: fetchError } = await database
    .from('schedule_events')
    .select(SCHEDULE_EVENT_FULL_SELECT)
    .eq('id', insertedId)
    .eq('organization_id', user.orgId)
    .single()
  if (fetchError) {
    console.error('[schedule:create] fetch error:', fetchError)
    return res.status(500).json({ error: '作成後の取得に失敗しました', detail: fetchError.message })
  }
  return res.status(201).json(fullEvent)
}

// ─── handleUpdate (PATCH) ────────────────────────────────────────────────
async function handleUpdate(req: VercelRequest, res: VercelResponse, user: AuthUser) {
  const id = req.query.id as string | undefined
  if (!id) return res.status(400).json({ error: 'id クエリパラメータが必要です' })

  const expectedUpdatedAt = req.query.expected_updated_at as string | undefined

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const database = db as any
  const body = (req.body ?? {}) as Record<string, unknown>
  const updateRow = pickFields(body, SCHEDULE_UPDATABLE_FIELDS)

  if (Object.keys(updateRow).length === 0) {
    return res.status(400).json({ error: '更新可能なフィールドがありません' })
  }

  // 対象イベントが自組織か確認
  const { data: existing, error: existingErr } = await database
    .from('schedule_events')
    .select('id, organization_id, store_id')
    .eq('id', id)
    .maybeSingle()
  if (existingErr) {
    console.error('[schedule:update] existing lookup error:', existingErr)
    return res.status(500).json({ error: '公演情報の確認に失敗しました' })
  }
  if (!existing) return res.status(404).json({ error: '公演が見つかりません' })
  if (existing.organization_id !== user.orgId) {
    return res.status(403).json({ error: '他組織の公演は編集できません' })
  }

  // store_id を変える場合、移動先店舗も自組織か確認
  if (typeof updateRow.store_id === 'string' && updateRow.store_id !== existing.store_id) {
    const { data: newStore, error: newStoreErr } = await database
      .from('stores')
      .select('id, organization_id')
      .eq('id', updateRow.store_id)
      .maybeSingle()
    if (newStoreErr) {
      return res.status(500).json({ error: '店舗確認に失敗しました' })
    }
    if (!newStore) return res.status(404).json({ error: '店舗が見つかりません' })
    if (newStore.organization_id !== user.orgId) {
      return res.status(403).json({ error: '他組織の店舗は使用できません' })
    }
  }

  // シナリオ名から自動マッチング
  const scenarioInput = typeof updateRow.scenario === 'string' ? updateRow.scenario : undefined
  if (scenarioInput && !updateRow.scenario_master_id) {
    const match = await findMatchingScenario(scenarioInput)
    if (match) {
      updateRow.scenario_master_id = match.id
      updateRow.scenario = match.title
    }
  }

  // organization_scenario_id を自動設定（scenario_master_id 経由）
  if (updateRow.scenario_master_id && !updateRow.organization_scenario_id) {
    const { data: orgScenario } = await database
      .from('organization_scenarios')
      .select('id')
      .eq('scenario_master_id', updateRow.scenario_master_id as string)
      .eq('organization_id', user.orgId)
      .maybeSingle()
    if (orgScenario?.id) {
      updateRow.organization_scenario_id = orgScenario.id
    }
  }

  if (typeof updateRow.category === 'string' && !DB_VALID_CATEGORIES.includes(updateRow.category)) {
    updateRow.category = 'open'
  }

  let updatePayload: Record<string, unknown> = { ...updateRow, updated_at: new Date().toISOString() }
  let lastError: { message?: string; details?: string; hint?: string; code?: string } | null = null
  let updateSucceeded = false
  for (let attempt = 0; attempt < 3; attempt += 1) {
    let query = database
      .from('schedule_events')
      .update(updatePayload)
      .eq('id', id)
      .eq('organization_id', user.orgId)
    if (expectedUpdatedAt) {
      query = query.eq('updated_at', expectedUpdatedAt)
    }
    const { error } = await query.select('id').single()

    if (!error) {
      updateSucceeded = true
      break
    }
    if (expectedUpdatedAt && error.code === 'PGRST116') {
      return res.status(409).json({ error: '他のユーザーが先にこのイベントを更新しました。ページを再読み込みして最新データを確認してください。' })
    }
    lastError = error
    const removal = removeMissingScheduleColumn(updatePayload, error)
    if (!removal) break
    updatePayload = removal.nextPayload
  }

  if (!updateSucceeded) {
    console.error('[schedule:update] update error:', lastError)
    return res.status(500).json({ error: '公演の更新に失敗しました', detail: lastError?.message })
  }

  const { data: fullEvent, error: fetchError } = await database
    .from('schedule_events')
    .select(SCHEDULE_EVENT_FULL_SELECT)
    .eq('id', id)
    .eq('organization_id', user.orgId)
    .single()
  if (fetchError) {
    console.error('[schedule:update] fetch error:', fetchError)
    return res.status(500).json({ error: '更新後の取得に失敗しました', detail: fetchError.message })
  }
  return res.status(200).json(fullEvent)
}

// ─── handleToggleCancel (PATCH action=toggle-cancel) ─────────────────────
async function handleToggleCancel(req: VercelRequest, res: VercelResponse, user: AuthUser) {
  const id = req.query.id as string | undefined
  if (!id) return res.status(400).json({ error: 'id クエリパラメータが必要です' })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const database = db as any
  const body = (req.body ?? {}) as Record<string, unknown>
  const isCancelled = body.is_cancelled === true
  const cancellationReason = typeof body.cancellation_reason === 'string' ? body.cancellation_reason : null

  // 自組織のイベントか確認
  const { data: existing, error: existingErr } = await database
    .from('schedule_events')
    .select('id, organization_id')
    .eq('id', id)
    .maybeSingle()
  if (existingErr) return res.status(500).json({ error: '公演情報の確認に失敗しました' })
  if (!existing) return res.status(404).json({ error: '公演が見つかりません' })
  if (existing.organization_id !== user.orgId) {
    return res.status(403).json({ error: '他組織の公演は変更できません' })
  }

  const updateData: Record<string, unknown> = {
    is_cancelled: isCancelled,
    cancellation_reason: isCancelled ? cancellationReason : null,
    cancelled_at: isCancelled ? new Date().toISOString() : null,
  }

  const { error } = await database
    .from('schedule_events')
    .update(updateData)
    .eq('id', id)
    .eq('organization_id', user.orgId)
  if (error) {
    console.error('[schedule:toggle-cancel] update error:', error)
    return res.status(500).json({ error: '公演の中止状態切り替えに失敗しました', detail: error.message })
  }

  const { data, error: fetchError } = await database
    .from('schedule_events')
    .select()
    .eq('id', id)
    .eq('organization_id', user.orgId)
    .single()
  if (fetchError) {
    return res.status(500).json({ error: '取得に失敗しました', detail: fetchError.message })
  }
  return res.status(200).json(data)
}

// ─── handleDelete (DELETE) ───────────────────────────────────────────────
async function handleDelete(req: VercelRequest, res: VercelResponse, user: AuthUser) {
  const id = req.query.id as string | undefined
  if (!id) return res.status(400).json({ error: 'id クエリパラメータが必要です' })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const database = db as any

  const { data: existing, error: existingErr } = await database
    .from('schedule_events')
    .select('id, organization_id')
    .eq('id', id)
    .maybeSingle()
  if (existingErr) return res.status(500).json({ error: '公演情報の確認に失敗しました' })
  if (!existing) return res.status(404).json({ error: '公演が見つかりません' })
  if (existing.organization_id !== user.orgId) {
    return res.status(403).json({ error: '他組織の公演は削除できません' })
  }

  const { error } = await database
    .from('schedule_events')
    .delete()
    .eq('id', id)
    .eq('organization_id', user.orgId)
  if (error) {
    console.error('[schedule:delete] DB error:', error)
    return res.status(500).json({ error: '公演の削除に失敗しました', detail: error.message })
  }
  return res.status(204).end()
}

// ─── handleAddDemoParticipants (POST action=add-demo-participants) ───────
async function handleAddDemoParticipants(_req: VercelRequest, res: VercelResponse, user: AuthUser) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const database = db as any

  // 中止でない自組織の全公演を取得
  const { data: events, error: eventsError } = await database
    .from('schedule_events')
    .select('id, organization_id, scenario_master_id, scenario, store_id, date, start_time, category, gms, capacity, max_participants')
    .eq('is_cancelled', false)
    .eq('organization_id', user.orgId)
    .order('date', { ascending: true })

  if (eventsError) {
    console.error('[schedule:add-demo] events fetch error:', eventsError)
    return res.status(500).json({ error: '公演データの取得に失敗しました', detail: eventsError.message })
  }
  if (!events || events.length === 0) {
    return res.status(200).json({ success: true, message: '中止でない公演が見つかりません', successCount: 0, errorCount: 0 })
  }

  const orgScenarioMap = await getOrgScenarioPlayerCounts(user.orgId)
  let successCount = 0
  let errorCount = 0

  for (const event of events as Array<Record<string, unknown> & { id: string; scenario_master_id: string | null; organization_id: string; scenario: string | null; store_id: string | null; date: string; start_time: string; category: string; gms: string[] | null; capacity: number | null; max_participants: number | null }>) {
    try {
      const { data: reservations, error: reservationError } = await database
        .from('reservations')
        .select('participant_count, participant_names')
        .eq('schedule_event_id', event.id)
        .in('status', [...ACTIVE_RESERVATION_STATUSES])
      if (reservationError && reservationError.code !== 'PGRST116') {
        errorCount++
        continue
      }

      const reservedParticipants = ((reservations as Array<{ participant_count: number | null; participant_names: string[] | null }> | null) ?? [])
        .reduce((sum, r) => sum + (r.participant_count || 0), 0)

      const capacity = resolveMaxParticipants(
        { scenario_master_id: event.scenario_master_id, scenario: event.scenario, max_participants: event.max_participants, capacity: event.capacity },
        orgScenarioMap,
      )

      const hasDemoParticipant = ((reservations as Array<{ participant_names: string[] | null }> | null) ?? []).some(r =>
        r.participant_names?.some((name: string) => typeof name === 'string' && name.includes('デモ')),
      )

      const neededParticipants = capacity - reservedParticipants
      if (neededParticipants <= 0 || hasDemoParticipant) continue
      if (!event.scenario_master_id) continue

      const { data: scenarioMaster, error: masterError } = await database
        .from('scenario_masters')
        .select('id, title, official_duration')
        .eq('id', event.scenario_master_id)
        .single()
      if (masterError) { errorCount++; continue }

      const { data: orgScenario } = await database
        .from('organization_scenarios')
        .select('participation_fee, gm_test_participation_fee')
        .eq('scenario_master_id', event.scenario_master_id)
        .eq('organization_id', user.orgId)
        .maybeSingle()

      const isGmTest = event.category === 'gmtest'
      const participationFee = isGmTest
        ? ((orgScenario as { gm_test_participation_fee?: number; participation_fee?: number } | null)?.gm_test_participation_fee
          || (orgScenario as { participation_fee?: number } | null)?.participation_fee
          || 0)
        : ((orgScenario as { participation_fee?: number } | null)?.participation_fee || 0)

      const demoReservation: Record<string, unknown> = {
        schedule_event_id: event.id,
        organization_id: user.orgId, // ← サーバ強制
        title: event.scenario || (scenarioMaster as { title?: string } | null)?.title || '',
        scenario_master_id: event.scenario_master_id,
        store_id: event.store_id || null,
        customer_id: null,
        customer_notes: neededParticipants === 1 ? 'デモ参加者' : `デモ参加者${neededParticipants}名`,
        requested_datetime: `${event.date}T${event.start_time}+09:00`,
        duration: (scenarioMaster as { official_duration?: number } | null)?.official_duration || 120,
        participant_count: neededParticipants,
        participant_names: Array(neededParticipants).fill(null).map((_, i) =>
          neededParticipants === 1 ? 'デモ参加者' : `デモ参加者${i + 1}`,
        ),
        assigned_staff: event.gms || [],
        base_price: participationFee * neededParticipants,
        options_price: 0,
        total_price: participationFee * neededParticipants,
        discount_amount: 0,
        final_price: participationFee * neededParticipants,
        payment_method: 'onsite',
        payment_status: 'paid',
        status: 'confirmed',
        reservation_source: 'demo',
      }

      const { error: insertError } = await database
        .from('reservations')
        .insert(demoReservation)
      if (insertError) { errorCount++; continue }

      // 参加者数を予約テーブルから再計算して schedule_events を更新
      const { data: allReservations, error: allResError } = await database
        .from('reservations')
        .select('participant_count')
        .eq('schedule_event_id', event.id)
        .in('status', [...ACTIVE_RESERVATION_STATUSES])
      if (!allResError) {
        const totalParticipants = ((allReservations as Array<{ participant_count: number | null }> | null) ?? [])
          .reduce((sum, r) => sum + (r.participant_count || 0), 0)
        await database
          .from('schedule_events')
          .update({ current_participants: totalParticipants })
          .eq('id', event.id)
          .eq('organization_id', user.orgId)
      }

      successCount++
    } catch (err) {
      console.error(`[schedule:add-demo] event ${event.id} error:`, err)
      errorCount++
    }
  }

  return res.status(200).json({
    success: true,
    message: `デモ参加者追加完了: 成功${successCount}件, エラー${errorCount}件`,
    successCount,
    errorCount,
  })
}

// ─── handleRemoveDemoReservations (POST action=remove-demo-reservations) ─
async function handleRemoveDemoReservations(_req: VercelRequest, res: VercelResponse, user: AuthUser) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const database = db as any

  // RPC は SECURITY DEFINER だが、自組織のデモ予約のみを削除するため、
  // ここでは手動で対象を絞ってから DELETE する（org スコープを強制）。
  const { data, error } = await database
    .from('reservations')
    .delete()
    .eq('reservation_source', 'demo')
    .eq('organization_id', user.orgId)
    .select('id')

  if (error) {
    console.error('[schedule:remove-demo] DB error:', error)
    return res.status(500).json({ error: 'デモ予約の削除に失敗しました', detail: error.message })
  }
  const deletedCount = Array.isArray(data) ? data.length : 0
  return res.status(200).json({ success: true, deletedCount })
}

// api/schedule.ts の月別のカレンダー（by-month、貸切の合成を含む）（整備 Phase 3、#774。元の行をそのまま移した。ロジックの変更なし）
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { db } from '../db.js'
import { type AuthUser } from '../auth.js'
import { ACTIVE_RESERVATION_STATUSES_SET, RESERVATION_SOURCE_WEB_PRIVATE, SCHEDULE_EVENT_MONTH_SELECT, PRIVATE_BOOKING_SELECT, CandidateDateTime, getOrgScenarioPlayerCounts, resolveMaxParticipants } from './common.js'

// ─── by-month (scheduleApi.getByMonth) ───────────────────────────────────
export async function handleByMonth(req: VercelRequest, res: VercelResponse, user: AuthUser) {
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
  const { data: scheduleEventsRaw, error } = await db!
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
        db!
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

    const maxParticipants = resolveMaxParticipants(event, orgScenarioMap)

    // current_participants は DB トリガー（trigger_recalc_participants）が予約変更時に同期するため、
    // 読み取り時の書き戻しはしない（Realtime エコーで全クライアントの再フェッチを誘発していた）

    // 表示人数は、出どころ不問で有効な予約の人数の合計。定員で頭打ちにしない（#730、#794）。
    // 管理者の手動追加（満席の公演へのスタッフ席など）で定員を超えることを許す規則で、画面は「人数 / 定員」の分数で出すので、超過は見て分かる。
    const effectiveParticipants = event.is_cancelled
      ? Math.max(actualParticipants, event.current_participants || 0)
      : (hasAnyReservations
          ? actualParticipants
          : (event.current_participants || 0))

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
    const { data: confirmedPrivateBookings, error: privateError } = await db!
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
        const { data: gmStaffList } = await db!
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

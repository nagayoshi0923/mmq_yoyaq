// api/reservations.ts の読み取り（一覧・公演別・顧客別・集計・空席）（整備 Phase 3、#774。元の行をそのまま移した。ロジックの変更なし）
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { db } from '../db.js'
import { RESERVATION_SELECT_FIELDS, RESERVATION_WITH_CUSTOMER_SELECT_FIELDS, RESERVATION_SUMMARY_SELECT_FIELDS, ACTIVE_STATUSES } from './common.js'

// 既存の getAll / getByDateRange
export async function handleGetAllOrRange(req: VercelRequest, res: VercelResponse, orgId: string) {
  if (!db) return res.status(500).json({ error: 'db unavailable' })
  const start = req.query.start as string | undefined
  const end = req.query.end as string | undefined

  let query = db!
    .from('reservations')
    .select(RESERVATION_SELECT_FIELDS)
    .eq('organization_id', orgId)

  if (start && end) {
    query = query
      .gte('requested_datetime', start)
      .lte('requested_datetime', end)
      .order('requested_datetime', { ascending: true })
  } else {
    query = query.order('requested_datetime', { ascending: false })
  }

  const { data, error } = await query
  if (error) {
    console.error('[reservations] handleGetAllOrRange error:', error)
    return res.status(500).json({ error: 'データ取得に失敗しました', detail: error.message })
  }
  return res.status(200).json(data ?? [])
}

// getByScheduleEvent: 特定イベントの予約 + customers JOIN
export async function handleGetByScheduleEvent(req: VercelRequest, res: VercelResponse, orgId: string) {
  if (!db) return res.status(500).json({ error: 'db unavailable' })
  const scheduleEventId = req.query.schedule_event_id as string | undefined
  if (!scheduleEventId) {
    return res.status(400).json({ error: 'schedule_event_id が必要です' })
  }

  const { data, error } = await db!
    .from('reservations')
    .select(RESERVATION_WITH_CUSTOMER_SELECT_FIELDS)
    .eq('schedule_event_id', scheduleEventId)
    .eq('organization_id', orgId)
    .in('status', ACTIVE_STATUSES)
    .order('created_at', { ascending: true })

  if (error) {
    console.error('[reservations:by-schedule-event] error:', error)
    return res.status(500).json({ error: 'データ取得に失敗しました', detail: error.message })
  }
  return res.status(200).json(data ?? [])
}

// getByCustomer
export async function handleGetByCustomer(req: VercelRequest, res: VercelResponse, orgId: string) {
  if (!db) return res.status(500).json({ error: 'db unavailable' })
  const customerId = req.query.customer_id as string | undefined
  if (!customerId) {
    return res.status(400).json({ error: 'customer_id が必要です' })
  }

  const { data, error } = await db!
    .from('reservations')
    .select(RESERVATION_SELECT_FIELDS)
    .eq('customer_id', customerId)
    .eq('organization_id', orgId)
    .order('requested_datetime', { ascending: false })

  if (error) {
    console.error('[reservations:by-customer] error:', error)
    return res.status(500).json({ error: 'データ取得に失敗しました', detail: error.message })
  }
  return res.status(200).json(data ?? [])
}

// getSummary: reservation_summary ビュー（自組織のスケジュールに限定するため schedule_events で絞る）
export async function handleGetSummary(req: VercelRequest, res: VercelResponse, orgId: string) {
  if (!db) return res.status(500).json({ error: 'db unavailable' })
  const scheduleEventId = req.query.schedule_event_id as string | undefined

  // schedule_event_id 指定 → その 1 件のみ。ただし当該 schedule_event が自組織のものであることを確認。
  if (scheduleEventId) {
    const { data: ev, error: evError } = await db
      .from('schedule_events')
      .select('id')
      .eq('id', scheduleEventId)
      .eq('organization_id', orgId)
      .maybeSingle()
    if (evError) {
      console.error('[reservations:summary] schedule_events check error:', evError)
      return res.status(500).json({ error: 'データ取得に失敗しました', detail: evError.message })
    }
    if (!ev) {
      return res.status(404).json({ error: 'schedule_event が見つかりません' })
    }

    const { data, error } = await db!
      .from('reservation_summary')
      .select(RESERVATION_SUMMARY_SELECT_FIELDS)
      .eq('schedule_event_id', scheduleEventId)

    if (error) {
      console.error('[reservations:summary] error:', error)
      return res.status(500).json({ error: 'データ取得に失敗しました', detail: error.message })
    }
    return res.status(200).json(data ?? [])
  }

  // schedule_event_id 未指定 → 自組織のスケジュールに紐付くサマリだけを返す
  const { data: events, error: evError } = await db
    .from('schedule_events')
    .select('id')
    .eq('organization_id', orgId)
  if (evError) {
    console.error('[reservations:summary] schedule_events list error:', evError)
    return res.status(500).json({ error: 'データ取得に失敗しました', detail: evError.message })
  }
  const ids = (events ?? []).map((e: { id: string }) => e.id)
  if (ids.length === 0) return res.status(200).json([])

  const { data, error } = await db!
    .from('reservation_summary')
    .select(RESERVATION_SUMMARY_SELECT_FIELDS)
    .in('schedule_event_id', ids)

  if (error) {
    console.error('[reservations:summary] in() error:', error)
    return res.status(500).json({ error: 'データ取得に失敗しました', detail: error.message })
  }
  return res.status(200).json(data ?? [])
}

// getAvailability: 空席状況。自組織の schedule_event のみ。
export async function handleGetAvailability(req: VercelRequest, res: VercelResponse, orgId: string) {
  if (!db) return res.status(500).json({ error: 'db unavailable' })
  const scheduleEventId = req.query.schedule_event_id as string | undefined
  if (!scheduleEventId) {
    return res.status(400).json({ error: 'schedule_event_id が必要です' })
  }

  // マルチテナント境界: schedule_event が自組織のものか
  // platform customer (orgId='') では org 一致を要求しない（schedule_event_id 単独で検証）
  let evQ = db
    .from('schedule_events')
    .select('id')
    .eq('id', scheduleEventId)
  if (orgId) evQ = evQ.eq('organization_id', orgId)
  const { data: ev, error: evError } = await evQ.maybeSingle()
  if (evError) {
    console.error('[reservations:availability] schedule_events check error:', evError)
    return res.status(500).json({ error: 'データ取得に失敗しました', detail: evError.message })
  }
  if (!ev) {
    return res.status(404).json({ error: 'schedule_event が見つかりません' })
  }

  const { data, error } = await db!
    .from('reservation_summary')
    .select('schedule_event_id, max_participants, current_reservations, available_seats')
    .eq('schedule_event_id', scheduleEventId)
    .maybeSingle()

  if (error && error.code !== 'PGRST116') {
    console.error('[reservations:availability] error:', error)
    return res.status(500).json({ error: 'データ取得に失敗しました', detail: error.message })
  }

  if (!data) {
    return res.status(200).json({
      maxParticipants: null,
      currentReservations: 0,
      availableSeats: 0,
    })
  }

  return res.status(200).json({
    maxParticipants: data.max_participants,
    currentReservations: data.current_reservations,
    availableSeats: data.available_seats,
  })
}

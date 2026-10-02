// api/reservations.ts のスタッフ参加枠の予約と、スタッフ参加の同期 RPC（整備 Phase 3、#774。元の行をそのまま移した。ロジックの変更なし）
import { capacityError, isCapacityConstraintError, CAPACITY_CHANGED_MESSAGE } from '../scheduleCapacity.js'
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { db } from '../db.js'
import { createUserScopedClient, type AuthUser } from '../auth.js'
import { recordEventHistory, fetchEventSnapshotServer } from '../eventHistory.js'
import { RESERVATION_SELECT_FIELDS, RESERVATION_SOURCE_STAFF_ENTRY, generateReservationNumber } from './common.js'

export async function handleStaffParticipation(req: VercelRequest, res: VercelResponse, user: AuthUser, save: boolean) {
  const body = (req.body ?? {}) as Record<string, unknown>
  const eventId = save ? body.schedule_event_id : req.query.schedule_event_id
  if (typeof eventId !== 'string') return res.status(400).json({ error: '公演IDが必要です' })
  const client = createUserScopedClient(user.jwt)
  // New RPCs are deployed before the frontend; organization and actor are derived from JWT in DB.
  const { data, error } = await client.rpc(save ? 'sync_event_staff_participations' : 'get_event_staff_participations',
    save ? { p_event_id: eventId, p_entries: body.entries, p_expected: body.expected, p_gms: body.gms, p_gm_roles: body.gm_roles, p_expected_staff: body.expected_staff } : { p_event_id: eventId })
  if (error) {
    const status = error.code === '42501' ? 403 : ['40001','55P03','23514'].includes(error.code) ? 409 : error.code === '22023' || error.code === '22P02' ? 400 : 500
    return res.status(status).json({ error: status === 500 ? 'スタッフ参加の保存・取得に失敗しました' : error.message })
  }
  return res.status(200).json(data)
}

// スタッフ参加枠の予約（syncStaffReservations から呼ばれる）
// 通常の create_reservation_with_lock_v2 は payment_method='staff'/reservation_source=staff_entry を扱えないため、
// staff 専用の直接 INSERT エンドポイントとして提供する。
export async function handleCreateStaffEntry(req: VercelRequest, res: VercelResponse, user: AuthUser) {
  if (!db) return res.status(500).json({ error: 'db unavailable' })

  const body = (req.body ?? {}) as Record<string, unknown>
  const scheduleEventId = body.schedule_event_id as string | undefined
  const staffName = body.staff_name as string | undefined
  const eventDetails = (body.event_details ?? {}) as {
    date?: string
    start_time?: string
    scenario_master_id?: string | null
    scenario_title?: string | null
    store_id?: string | null
    duration?: number | null
  }

  if (!scheduleEventId || !staffName) {
    return res.status(400).json({ error: 'schedule_event_id / staff_name が必要です' })
  }

  // マルチテナント境界: schedule_event が自組織のものか
  // NOTE: schedule_events に `duration` カラムは存在しない (start_time/end_time から算出)
  const { data: ev, error: evError } = await db
    .from('schedule_events')
    .select('id, organization_id, date, start_time, end_time, scenario, scenario_master_id, store_id, max_participants, capacity, current_participants')
    .eq('id', scheduleEventId)
    .maybeSingle()
  if (evError) {
    console.error('[reservations:create-staff-entry] schedule_events select error:', evError)
    return res.status(500).json({ error: 'schedule_event の取得に失敗しました', detail: evError.message })
  }
  if (!ev) {
    return res.status(404).json({ error: 'schedule_event が見つかりません' })
  }
  if (ev.organization_id !== user.orgId) {
    return res.status(403).json({ error: '他組織の schedule_event は指定できません' })
  }

  const capacityMessage = capacityError(ev, undefined, 1)
  if (capacityMessage) return res.status(409).json({ error: capacityMessage, code: 'CAPACITY_EXCEEDED' })

  const reservationNumber = generateReservationNumber()
  const date = eventDetails.date || ev.date
  const startTime = eventDetails.start_time || ev.start_time
  // start_time / end_time から duration (分) を算出。失敗時は eventDetails か 120 にフォールバック
  const computedDuration: number = (() => {
    if (eventDetails.duration && eventDetails.duration > 0) return eventDetails.duration
    if (ev.start_time && ev.end_time) {
      const [sh, sm] = String(ev.start_time).split(':').map(Number)
      const [eh, em] = String(ev.end_time).split(':').map(Number)
      const diff = (eh * 60 + em) - (sh * 60 + sm)
      if (diff > 0) return diff
    }
    return 120
  })()

  const payload = {
    organization_id: user.orgId,
    schedule_event_id: scheduleEventId,
    reservation_number: reservationNumber,
    title: eventDetails.scenario_title || ev.scenario || '',
    scenario_master_id: eventDetails.scenario_master_id ?? ev.scenario_master_id ?? null,
    store_id: eventDetails.store_id ?? ev.store_id ?? null,
    customer_id: null,
    customer_notes: staffName,
    requested_datetime: `${date}T${startTime}+09:00`,
    duration: computedDuration,
    participant_count: 1,
    participant_names: [staffName],
    assigned_staff: [],
    base_price: 0,
    options_price: 0,
    total_price: 0,
    discount_amount: 0,
    final_price: 0,
    payment_method: 'staff',
    payment_status: 'paid',
    status: 'confirmed',
    reservation_source: RESERVATION_SOURCE_STAFF_ENTRY,
  }

  const { data: inserted, error: insertError } = await db!
    .from('reservations')
    .insert([payload])
    .select(RESERVATION_SELECT_FIELDS)
    .single()

  if (insertError) {
    if (isCapacityConstraintError(insertError)) {
      return res.status(409).json({ error: CAPACITY_CHANGED_MESSAGE, code: 'CAPACITY_EXCEEDED' })
    }
    console.error('[reservations:create-staff-entry] insert error:', insertError)
    return res.status(500).json({ error: 'スタッフ予約の作成に失敗しました', detail: insertError.message })
  }

  // schedule_event_history に add_participant を記録（スタッフ参加同期として）
  try {
    const snapshot = await fetchEventSnapshotServer(db, scheduleEventId, user.orgId)
    if (snapshot) {
      const cellDate = String(snapshot.date ?? '')
      const cellStoreId = String(snapshot.store_id ?? '')
      const cellTimeSlot = (snapshot.time_slot as string | null | undefined) ?? null
      if (cellDate && cellStoreId) {
        // 操作者の staff 名（user は GM 欄を更新したスタッフ）
        const { data: staffRow } = await db!
          .from('staff')
          .select('id, name')
          .eq('user_id', user.userId)
          .eq('organization_id', user.orgId)
          .maybeSingle()
        const actorName = (staffRow?.name as string | undefined) ?? '(スタッフ)'
        await recordEventHistory(db, {
          scheduleEventId,
          organizationId: user.orgId,
          actionType: 'add_participant',
          oldValues: null,
          newValues: {
            participant_name: staffName,
            participant_count: 1,
            reservation_source: 'staff_entry',
            reservation_id: (inserted as { id?: string }).id ?? null,
          },
          cellInfo: { date: cellDate, storeId: cellStoreId, timeSlot: cellTimeSlot },
          changedByUserId: user.userId,
          changedByStaffId: (staffRow?.id as string | undefined) ?? null,
          changedByName: `${actorName}（スタッフ参加同期）`,
          notes: `${staffName} をスタッフ参加で同期`,
        })
      }
    }
  } catch (historyError) {
    console.error('[reservations:create-staff-entry] history record error:', historyError)
  }

  return res.status(201).json(inserted)
}

// api/reservations.ts の予約の作成（RPC create_reservation_with_lock_v2）（整備 Phase 3、#774。元の行をそのまま移した。ロジックの変更なし）
import { assertReservationActor } from '../reservationActor.js'
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { db } from '../db.js'
import { createUserScopedClient, type AuthUser } from '../auth.js'
import { recordEventHistory, fetchEventSnapshotServer } from '../eventHistory.js'
import { RESERVATION_SELECT_FIELDS, generateReservationNumber } from './common.js'

export async function handleCreate(req: VercelRequest, res: VercelResponse, user: AuthUser) {
  if (!db) return res.status(500).json({ error: 'db unavailable' })

  const body = (req.body ?? {}) as Record<string, unknown>
  const reservation = (body.reservation ?? body) as Record<string, unknown>

  const scheduleEventId = reservation.schedule_event_id as string | undefined
  const customerId = reservation.customer_id as string | undefined
  const participantCount = reservation.participant_count as number | undefined
  if (!scheduleEventId || !customerId || participantCount == null) {
    return res.status(400).json({
      error: 'schedule_event_id / customer_id / participant_count が必要です',
    })
  }

  // schedule_event の存在確認のみ（org チェックは RPC 内部で実施）
  // RPC が auth.uid() ベースで安全にチェックするため、ここでは不要
  const { data: ev, error: evError } = await db
    .from('schedule_events')
    .select('id, organization_id')
    .eq('id', scheduleEventId)
    .maybeSingle()
  if (evError || !ev) {
    console.error('[reservations:create] schedule_events check error:', evError)
    return res.status(404).json({ error: 'schedule_event が見つかりません' })
  }

  const { data: cust, error: custError } = await db
    .from('customers')
    .select('id, organization_id, user_id')
    .eq('id', customerId)
    .maybeSingle()
  if (custError || !cust) {
    console.error('[reservations:create] customers check error:', custError)
    return res.status(404).json({ error: 'customer が見つかりません' })
  }
  await assertReservationActor(db, user, ev.organization_id, cust)
  // 本人の旧org付き顧客は利用を維持。他人を代理する場合は公演の組織に限る。
  if (cust.user_id !== user.userId && cust.organization_id !== null && cust.organization_id !== ev.organization_id) {
    return res.status(403).json({ error: '他組織の customer は指定できません' })
  }

  // 予約番号（冪等性: クライアント提供を優先）
  const providedReservationNumber = reservation.reservation_number as string | undefined
  const reservationNumber = providedReservationNumber || generateReservationNumber()

  // RPC 呼び出し（auth.uid() を伝播する user-scoped client を使う）
  const userClient = createUserScopedClient(user.jwt)
  const { data: createdId, error: rpcError } = await userClient.rpc(
    'create_reservation_with_lock_v2',
    {
      p_schedule_event_id: scheduleEventId,
      p_participant_count: participantCount,
      p_customer_id: customerId,
      p_customer_name: (reservation.customer_name as string | null) ?? null,
      p_customer_email: (reservation.customer_email as string | null) ?? null,
      p_customer_phone: (reservation.customer_phone as string | null) ?? null,
      p_notes: (reservation.customer_notes as string | null) ?? null,
      p_how_found: (reservation as Record<string, unknown>).how_found as string | null ?? null,
      p_reservation_number: reservationNumber,
      p_customer_coupon_id:
        (reservation as Record<string, unknown>).customer_coupon_id as string | null ?? null,
    },
  )

  if (rpcError) {
    console.error('[reservations:create] RPC error:', rpcError)
    // 冪等性: UNIQUE 違反の場合、既存予約を返す
    const code = String((rpcError as { code?: string }).code || '')
    const msg = String((rpcError as { message?: string }).message || '')
    const isUniqueViolation =
      code === '23505' ||
      msg.includes('reservation_number') ||
      msg.includes('duplicate') ||
      msg.includes('unique')
    if (isUniqueViolation && reservationNumber) {
      const { data: existing } = await db
        .from('reservations')
        .select(RESERVATION_SELECT_FIELDS)
        .eq('reservation_number', reservationNumber)
        .eq('organization_id', ev.organization_id)
        .eq('customer_id', customerId)
        .eq('schedule_event_id', scheduleEventId)
        .eq('participant_count', participantCount)
        .maybeSingle()
      if (existing) return res.status(200).json(existing)
    }
    if (['P0010', 'P0011', 'P0012', 'P0013', '42501'].includes(code)) {
      return res.status(403).json({ error: 'この予約を操作する権限がありません', code })
    }
    // 既知のエラーコードはメッセージを訳して返す
    const known: Record<string, string> = {
      P0001: '参加人数が不正です',
      P0002: '公演が見つかりません',
      P0003: 'この公演は満席です',
      P0004: '選択した人数分の空席がありません',
      P0021: '有効なメールアドレスを入力してください',
      P0055: '予約番号と申込内容が一致しません。予約履歴をご確認ください。',
      P0028: '選択したクーポンは現在利用できません。有効期限や利用状況を確認して選び直してください。',
      P0046: 'この店舗は現在、公演の予約受付を停止しています',
    }
    if (known[code]) {
      return res.status(400).json({ error: known[code], code, detail: msg })
    }
    return res.status(500).json({ error: '予約作成に失敗しました', detail: msg, code })
  }

  const reservationId = createdId as string | null
  if (!reservationId) {
    return res.status(500).json({ error: '予約 ID が取得できませんでした' })
  }

  const { data: created, error: fetchError } = await db
    .from('reservations')
    .select(RESERVATION_SELECT_FIELDS)
    .eq('id', reservationId)
    .single()

  if (fetchError || !created) {
    console.error('[reservations:create] fetch after insert error:', fetchError)
    return res.status(500).json({ error: '作成後の予約取得に失敗しました' })
  }

  // schedule_event_history に add_participant を記録（失敗しても予約作成は成功させる）
  try {
    const snapshot = ev.organization_id
      ? await fetchEventSnapshotServer(db, scheduleEventId, ev.organization_id as string)
      : null
    if (snapshot && ev.organization_id) {
      const customerName =
        (reservation.customer_name as string | undefined)?.trim() ||
        '(お客様)'
      const reservationSource =
        (reservation.reservation_source as string | undefined) ?? 'web'
      const cellTimeSlot = (snapshot.time_slot as string | null | undefined) ?? null
      const cellDate = String(snapshot.date ?? '')
      const cellStoreId = String(snapshot.store_id ?? '')
      if (cellDate && cellStoreId) {
        await recordEventHistory(db, {
          scheduleEventId,
          organizationId: ev.organization_id as string,
          actionType: 'add_participant',
          oldValues: null,
          newValues: {
            participant_name: customerName,
            participant_count: participantCount,
            reservation_source: reservationSource,
            reservation_id: reservationId,
          },
          cellInfo: { date: cellDate, storeId: cellStoreId, timeSlot: cellTimeSlot },
          changedByUserId: user.userId,
          changedByStaffId: null,
          changedByName: `${customerName}（お客様）`,
          notes: `${customerName}（${participantCount}名）が予約サイトから予約`,
        })
      }
    }
  } catch (historyError) {
    console.error('[reservations:create] history record error:', historyError)
    // 履歴記録の失敗は予約成功に影響させない
  }

  return res.status(201).json(created)
}

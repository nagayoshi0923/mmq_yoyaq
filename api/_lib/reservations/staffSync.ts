// api/reservations.ts のスタッフ参加予約の一括ステータス変更（整備 Phase 3、#774。元の行をそのまま移した。ロジックの変更なし）
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { db } from '../db.js'
import { type AuthUser } from '../auth.js'
import { recordEventHistory, fetchEventSnapshotServer } from '../eventHistory.js'

// syncStaffReservations から呼ばれる、複数予約のステータスを一括 cancelled に変更するエンドポイント。
// （旧 client の syncStaffReservations は this.update(id, { status: 'cancelled' }) を for ループで呼んでいた）
export async function handleSyncStaffReservationStatuses(
  req: VercelRequest,
  res: VercelResponse,
  user: AuthUser,
) {
  if (!db) return res.status(500).json({ error: 'db unavailable' })
  const body = (req.body ?? {}) as Record<string, unknown>
  const ids = body.reservation_ids as string[] | undefined
  const newStatus = (body.status as string | undefined) ?? 'cancelled'
  if (!Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ error: 'reservation_ids（配列）が必要です' })
  }

  // 全 ID が自組織のものか確認 + 履歴記録用のメタデータも一緒に取得
  const { data: owned, error: ownedError } = await db
    .from('reservations')
    .select('id, organization_id, schedule_event_id, participant_names, participant_count, reservation_source')
    .in('id', ids)
  if (ownedError) {
    console.error('[reservations:sync-staff] owned check error:', ownedError)
    return res.status(500).json({ error: '所有確認に失敗しました', detail: ownedError.message })
  }
  type OwnedRow = {
    id: string
    organization_id: string
    schedule_event_id: string | null
    participant_names: string[] | null
    participant_count: number | null
    reservation_source: string | null
  }
  const ownedRows = (owned ?? []) as OwnedRow[]
  const safeRows = ownedRows.filter(r => r.organization_id === user.orgId)
  const safeIds = safeRows.map(r => r.id)
  if (safeIds.length === 0) {
    return res.status(403).json({ error: '対象予約が見つからない、または他組織の予約です' })
  }

  // 直接 UPDATE（service_role で RLS バイパス + 上で組織検証済み）。
  // RPC を使わない理由: admin_update_reservation_fields は 1 件ずつしか扱わないため、N+1 を避ける。
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error: updateError } = await (db as any)
    .from('reservations')
    .update({ status: newStatus, updated_at: new Date().toISOString() })
    .in('id', safeIds)
    .eq('organization_id', user.orgId)

  if (updateError) {
    console.error('[reservations:sync-staff] update error:', updateError)
    return res.status(500).json({ error: '一括ステータス更新に失敗しました', detail: updateError.message })
  }

  // newStatus が 'cancelled' のときだけ remove_participant 履歴を記録（スタッフ参加同期）
  if (newStatus === 'cancelled') {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: staffRow } = await (db as any)
        .from('staff')
        .select('id, name')
        .eq('user_id', user.userId)
        .eq('organization_id', user.orgId)
        .maybeSingle()
      const actorName = (staffRow?.name as string | undefined) ?? '(スタッフ)'
      const actorStaffId = (staffRow?.id as string | undefined) ?? null

      // schedule_event_id 単位でスナップショットをキャッシュして N+1 を回避
      const snapshotCache = new Map<string, Record<string, unknown> | null>()
      await Promise.all(
        safeRows
          .filter(r => r.schedule_event_id)
          .map(async (r) => {
            const eventId = r.schedule_event_id as string
            if (!snapshotCache.has(eventId)) {
              snapshotCache.set(eventId, await fetchEventSnapshotServer(db!, eventId, user.orgId))
            }
            const snapshot = snapshotCache.get(eventId)
            if (!snapshot) return
            const cellDate = String(snapshot.date ?? '')
            const cellStoreId = String(snapshot.store_id ?? '')
            const cellTimeSlot = (snapshot.time_slot as string | null | undefined) ?? null
            if (!cellDate || !cellStoreId) return
            const targetName = r.participant_names?.[0] ?? '(スタッフ)'
            await recordEventHistory(db!, {
              scheduleEventId: eventId,
              organizationId: user.orgId,
              actionType: 'remove_participant',
              oldValues: {
                participant_name: targetName,
                participant_count: r.participant_count ?? 1,
                reservation_source: r.reservation_source ?? 'staff_entry',
                reservation_id: r.id,
              },
              newValues: null,
              cellInfo: { date: cellDate, storeId: cellStoreId, timeSlot: cellTimeSlot },
              changedByUserId: user.userId,
              changedByStaffId: actorStaffId,
              changedByName: `${actorName}（スタッフ参加同期）`,
              notes: `${targetName} をスタッフ参加同期で解除`,
            })
          })
      )
    } catch (historyError) {
      console.error('[reservations:sync-staff] history record error:', historyError)
    }
  }

  return res.status(200).json({ success: true, updatedCount: safeIds.length })
}

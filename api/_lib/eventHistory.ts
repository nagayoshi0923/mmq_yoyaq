// schedule_event_history への書き込みヘルパー（サーバ側用）
// クライアント側の createEventHistory はブラウザ経由で /api/event-history を叩くため、
// 別の API エンドポイント（/api/reservations 等）の中で「同じ DB 操作」を行いたい時にこちらを使う。

import type { SupabaseClient } from '@supabase/supabase-js'

// schedule_events_staff_view から SELECT する snapshot 列
// クライアント側 SNAPSHOT_COLUMNS と同期させること
export const SNAPSHOT_COLUMNS =
  'id, organization_id, date, venue, store_id, scenario, scenario_master_id, ' +
  'gms, gm_roles, start_time, end_time, category, capacity, max_participants, ' +
  'current_participants, notes, is_cancelled, is_tentative, is_reservation_enabled, ' +
  'is_private_request, reservation_name, time_slot, venue_rental_fee'

export type ServerActionType =
  | 'create'
  | 'update'
  | 'delete'
  | 'cancel'
  | 'restore'
  | 'publish'
  | 'unpublish'
  | 'add_participant'
  | 'remove_participant'
  | 'move_out'
  | 'move_in'
  | 'copy'

export interface RecordEventHistoryParams {
  scheduleEventId: string | null
  organizationId: string
  actionType: ServerActionType
  oldValues: Record<string, unknown> | null
  newValues: Record<string, unknown> | null
  cellInfo: { date: string; storeId: string; timeSlot: string | null }
  changedByUserId?: string | null
  changedByStaffId?: string | null
  changedByName: string
  changes?: Record<string, unknown>
  notes?: string | null
  deletedEventScenario?: string | null
}

/**
 * schedule_event_history に履歴行を 1 件 INSERT する。
 * 失敗してもエラーを throw せず、呼び出し側の主処理（予約作成等）を妨げない。
 */
export async function recordEventHistory(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: SupabaseClient<any, 'public', any>,
  params: RecordEventHistoryParams,
): Promise<void> {
  try {
    const entry = {
      schedule_event_id: params.scheduleEventId,
      organization_id: params.organizationId,
      event_date: params.cellInfo.date,
      store_id: params.cellInfo.storeId,
      time_slot: params.cellInfo.timeSlot,
      changed_by_user_id: params.changedByUserId ?? null,
      changed_by_staff_id: params.changedByStaffId ?? null,
      changed_by_name: params.changedByName,
      action_type: params.actionType,
      changes: params.changes ?? {},
      old_values: params.oldValues,
      new_values: params.newValues,
      deleted_event_scenario: params.deletedEventScenario ?? null,
      notes: params.notes ?? null,
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (db as any).from('schedule_event_history').insert(entry)
    if (error) {
      console.error('[recordEventHistory] insert error:', error)
    }
  } catch (e) {
    console.error('[recordEventHistory] unexpected error:', e)
  }
}

/**
 * schedule_events_staff_view から 1 件分のフル状態スナップショットを取得する。
 * 失敗時は null を返す（履歴記録の失敗は主処理を妨げない）。
 */
export async function fetchEventSnapshotServer(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: SupabaseClient<any, 'public', any>,
  scheduleEventId: string,
): Promise<Record<string, unknown> | null> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (db as any)
      .from('schedule_events_staff_view')
      .select(SNAPSHOT_COLUMNS)
      .eq('id', scheduleEventId)
      .maybeSingle()
    if (error) {
      console.error('[fetchEventSnapshotServer] error:', error)
      return null
    }
    return (data as Record<string, unknown>) ?? null
  } catch (e) {
    console.error('[fetchEventSnapshotServer] unexpected error:', e)
    return null
  }
}

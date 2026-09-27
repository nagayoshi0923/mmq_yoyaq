import { supabase } from '@/lib/supabase'

/** 未確定・取消・無断欠席と未来の公演は体験済みにしない。 */
export const PLAYED_RESERVATION_STATUSES = ['confirmed', 'gm_confirmed', 'checked_in', 'completed']
export function isPlayedReservation(row: { status: string; requested_datetime: string }, now = Date.now()): boolean {
  return PLAYED_RESERVATION_STATUSES.includes(row.status) && new Date(row.requested_datetime).getTime() <= now
}

/** 本人のRLS範囲で全履歴を取得。予約一覧の表示件数と体験履歴を分離する。 */
export async function fetchPlayedReservations(customerId: string, scenarioMasterId?: string) {
  const rows: Array<{ id: string; title: string; scenario_master_id: string | null; requested_datetime: string; status: string; organization_id: string | null; store_id: string | null }> = []
  const cutoff = new Date().toISOString()
  for (let offset = 0; ; offset += 500) {
    let query = supabase.from('reservations')
      .select('id, title, scenario_master_id, requested_datetime, status, organization_id, store_id')
      .eq('customer_id', customerId)
      .in('status', PLAYED_RESERVATION_STATUSES)
      .lte('requested_datetime', cutoff)
      .order('requested_datetime', { ascending: false }).order('id', { ascending: false })
      .range(offset, offset + 499)
    if (scenarioMasterId) query = query.eq('scenario_master_id', scenarioMasterId)
    const { data, error } = await query
    if (error) throw error
    rows.push(...(data ?? []))
    if (!data || data.length < 500) return rows
  }
}

/** 未体験指定は予約・手動の両方より優先する。 */
export function resolvePlayedScenarioIds(reservations: Array<{ scenario_master_id: string | null }>, manual: Array<{ scenario_master_id: string | null }>, overrides: Array<{ scenario_master_id: string }>): Set<string> {
  const ids = new Set([...reservations, ...manual].map(row => row.scenario_master_id).filter((id): id is string => !!id))
  overrides.forEach(row => ids.delete(row.scenario_master_id))
  return ids
}

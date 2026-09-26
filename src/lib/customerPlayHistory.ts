import { supabase } from '@/lib/supabase'

export interface ManualPlayHistoryEntry {
  id: string
  customer_id: string
  scenario_id: string | null
  scenario_master_id: string | null
  scenario_title: string
  played_at: string | null
  venue: string | null
  notes: string | null
  created_at: string | null
}
export interface PlayedOverrideEntry {
  id: string
  scenario_master_id: string
  reason: string | null
}
export interface PlayHistorySnapshot {
  manual: ManualPlayHistoryEntry[]
  overrides: PlayedOverrideEntry[]
}
export interface ManualPlayHistoryInput {
  scenario_title: string
  scenario_master_id?: string | null
  played_at?: string | null
  venue?: string | null
  notes?: string | null
}
async function action<T>(customerId: string, name: string, record: object = {}): Promise<T> {
  const { data, error } = await supabase.rpc('customer_play_history_action', {
    p_customer_id: customerId,
    p_action: name,
    p_record: record,
  })
  if (error) throw error
  if (data == null) throw new Error('体験済み履歴の処理結果を確認できませんでした')
  return data as T
}
export const customerPlayHistory = {
  snapshot: (customerId: string) => action<PlayHistorySnapshot>(customerId, 'snapshot'),
  add: (customerId: string, record: ManualPlayHistoryInput) => action<ManualPlayHistoryEntry>(customerId, 'add_manual', record),
  updateDate: async (customerId: string, id: string, playedAt: string) => (await action<{ updated: boolean }>(customerId, 'update_manual_date', { id, played_at: playedAt })).updated,
  remove: async (customerId: string, id: string) => (await action<{ removed: boolean }>(customerId, 'delete_manual', { id })).removed,
  addOverride: async (customerId: string, scenarioMasterId: string, reason?: string) => {
    await action(customerId, 'add_override', { scenario_master_id: scenarioMasterId, reason: reason ?? null })
  },
  removeOverride: async (customerId: string, scenarioMasterId: string) => (await action<{ removed: boolean }>(customerId, 'remove_override', { scenario_master_id: scenarioMasterId })).removed,
}

/**
 * 利用者の表の列設定（user_table_preferences）の書き込みAPI
 *
 * フック（useTablePreferences）から supabase.from() を直接呼ばず、ここを通す（整備 Phase 2）。
 * 戻り値は supabase の { error } をそのまま返す。
 */
import { supabase } from '@/lib/supabase'

export const tablePreferenceApi = {
  /** 利用者×表キーの列順・表示列を1件読む */
  async load(userId: string, tableKey: string) {
    return supabase
      .from('user_table_preferences')
      .select('column_order, column_visibility')
      .eq('user_id', userId)
      .eq('table_key', tableKey)
      .maybeSingle()
  },
  /** 利用者×表キーごとの列順・表示列を保存する（競合したら更新） */
  async save(userId: string, tableKey: string, columnOrder: string[], columnVisibility: Record<string, boolean>) {
    return supabase
      .from('user_table_preferences')
      .upsert(
        {
          user_id: userId,
          table_key: tableKey,
          column_order: columnOrder,
          column_visibility: columnVisibility,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id,table_key' }
      )
  },
}

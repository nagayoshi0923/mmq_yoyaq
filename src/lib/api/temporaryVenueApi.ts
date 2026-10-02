/**
 * 臨時会場（stores の is_temporary 行）の書き込みAPI
 *
 * 画面（useTemporaryVenues）から supabase.from('stores') を直接呼ばず、ここを通す（整備 Phase 2）。
 * 戻り値は supabase の { data, error } をそのまま返す。呼び出し側の「列が無いときの縮退」処理は元のまま。
 */
import { supabase } from '@/lib/supabase'

// NOTE: Supabase の型推論（select parser）の都合で、select 文字列は literal に寄せる
const TEMP_VENUE_SELECT_FIELDS =
  'id, name, short_name, is_temporary, temporary_dates, temporary_venue_names, display_order' as const

export const temporaryVenueApi = {
  /** 自組織の臨時会場（臨時1〜5）をすべて、名前順 */
  async listByOrganization(organizationId: string) {
    return supabase
      .from('stores')
      .select(TEMP_VENUE_SELECT_FIELDS)
      .eq('is_temporary', true)
      .eq('organization_id', organizationId)
      .order('name', { ascending: true })
  },
  /** 店舗のその日の公演（削除前の確認用。1件あれば足りる） */
  async listEventIdsOnDate(storeId: string, date: string) {
    return supabase
      .from('schedule_events')
      .select('id')
      .eq('store_id', storeId)
      .eq('date', date)
      .limit(1)
  },
  /** 臨時会場の日付・会場名を id で絞って更新する */
  async updateById(id: string, fields: { temporary_dates?: string[]; temporary_venue_names?: Record<string, string> }) {
    return supabase.from('stores').update(fields).eq('id', id)
  },
}

/**
 * 臨時会場（stores の is_temporary 行）の書き込みAPI
 *
 * 画面（useTemporaryVenues）から supabase.from('stores') を直接呼ばず、ここを通す（整備 Phase 2）。
 * 戻り値は supabase の { data, error } をそのまま返す。呼び出し側の「列が無いときの縮退」処理は元のまま。
 */
import { supabase } from '@/lib/supabase'

export const temporaryVenueApi = {
  /** 臨時会場の日付・会場名を id で絞って更新する */
  async updateById(id: string, fields: { temporary_dates?: string[]; temporary_venue_names?: Record<string, string> }) {
    return supabase.from('stores').update(fields).eq('id', id)
  },
}

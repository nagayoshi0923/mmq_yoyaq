/**
 * 予約の読み取りAPI（画面・部品から supabase.from('reservations') を直接呼ばず、ここを通す。整備 Phase 2、#773）
 * 絞り込み条件・select の列・戻り値（{ data, error }）は元の呼び出しのまま。
 */
import { supabase } from '@/lib/supabase'
import { RESERVATION_WITH_CUSTOMER_SELECT_FIELDS } from '@/lib/reservationApi'

export const reservationReadApi = {
  /** コマンドパレット: 予約番号・顧客名・題名の部分一致で最大5件（pattern は % 付き） */
  async searchForPalette(organizationId: string, pattern: string) {
    return supabase
      .from('reservations')
      .select('id, reservation_number, customer_name, title, status, actual_datetime')
      .eq('organization_id', organizationId)
      .or(`customer_name.ilike.${pattern},reservation_number.ilike.${pattern},title.ilike.${pattern}`)
      .order('actual_datetime', { ascending: false })
      .limit(5)
  },
  /** 予約 ID から、顧客つきで1件（有効な状態のみ。配列で返る） */
  async listActiveWithCustomerById(reservationId: string) {
    return supabase
      .from('reservations')
      .select(RESERVATION_WITH_CUSTOMER_SELECT_FIELDS)
      .eq('id', reservationId)
      .in('status', ['pending', 'confirmed', 'gm_confirmed', 'checked_in', 'cancelled'])
  },
  /** 名前の候補用: 顧客メモが空でない予約の顧客メモと参加者名。組織が分かれば絞る */
  async listCustomerNotes(organizationId?: string | null) {
    let query = supabase
      .from('reservations')
      .select('customer_notes, participant_names')
      .not('customer_notes', 'is', null)
      .not('customer_notes', 'eq', '')
    if (organizationId) {
      query = query.eq('organization_id', organizationId)
    }
    return query
  },
}

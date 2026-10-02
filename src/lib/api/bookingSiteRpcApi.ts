/**
 * 予約サイトの申請・承認の RPC API
 *
 * 画面・フックから supabase を直接呼ばず、ここを通す（整備 Phase 2、#773）。
 * 絞り込み条件・select の列・戻り値（{ data, error }）は元の呼び出しのまま。
 */
import { supabase } from '@/lib/supabase'

export const bookingSiteRpcApi = {
  /** 予約サイトの申請中の組織の一覧（RPC） */
  async getPendingApplications() {
    return supabase.rpc('get_pending_booking_site_applications')
  },

  /** 予約サイトの申請を承認する（RPC。プランが pro になる） */
  async approve(organizationId: string) {
    return supabase.rpc('approve_booking_site', { p_org_id: organizationId })
  },

  /** 予約サイトの利用を申請する（RPC） */
  async apply() {
    return supabase.rpc('apply_for_booking_site')
  },
}

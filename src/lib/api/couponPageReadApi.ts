/**
 * クーポン受け取り画面の読み取りAPI
 *
 * 画面・フックから supabase を直接呼ばず、ここを通す（整備 Phase 2、#773）。
 * 絞り込み条件・select の列・戻り値（{ data, error }）は元の呼び出しのまま。
 */
import { supabase } from '@/lib/supabase'

export const couponPageReadApi = {
  /** ログインユーザーの顧客（id と名前） */
  async findCustomerByUserId(userId: string) {
    return supabase
      .from('customers')
      .select('id, name')
      .eq('user_id', userId)
      .maybeSingle()
  },

  /** 顧客の有効なクーポン（キャンペーン情報つき、新しい順） */
  async listActiveCoupons(customerId: string) {
    return supabase
      .from('customer_coupons')
      .select(`
        id,
        uses_remaining,
        expires_at,
        status,
        coupon_campaigns:campaign_id (
          name,
          description,
          discount_type,
          discount_amount
        )
      `)
      .eq('customer_id', customerId)
      .eq('status', 'active')
      .order('created_at', { ascending: false })
  },
}

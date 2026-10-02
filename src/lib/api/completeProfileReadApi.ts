/**
 * プロフィール登録画面の読み取り・RPC の API
 *
 * 画面・フックから supabase を直接呼ばず、ここを通す（整備 Phase 2、#773）。
 * 絞り込み条件・select の列・戻り値（{ data, error }）は元の呼び出しのまま。
 */
import { supabase } from '@/lib/supabase'

export const completeProfileReadApi = {
  /** users の役割と所属組織 */
  async findUserRoleAndOrganization(userId: string) {
    return supabase
      .from('users')
      .select('role, organization_id')
      .eq('id', userId)
      .maybeSingle()
  },

  /** 組織の slug（見つからなければ null） */
  async findOrganizationSlug(organizationId: string | undefined) {
    return supabase
      .from('organizations')
      .select('slug')
      .eq('id', organizationId)
      .maybeSingle()
  },

  /** 自分の顧客行（id・名前・電話・メール。更新の新しい順に1件） */
  async listOwnCustomersLatestFirst(userId: string) {
    return supabase
      .from('customers')
      .select('id, name, phone, email')
      .eq('user_id', userId)
      .order('updated_at', { ascending: false })
      .limit(1)
  },

  /** そのメールが別のユーザーに紐付いているか（RPC） */
  async isEmailLinkedToOtherUser(email: string) {
    return supabase.rpc(
        'is_customer_email_linked_to_other_user',
        { p_email: email }
      )
  },

  /** 自分の顧客行の id（作成の古い順に1件） */
  async listOwnCustomerIdsOldestFirst(userId: string) {
    return supabase
      .from('customers')
      .select('id')
      .eq('user_id', userId)
      .order('created_at', { ascending: true })
      .limit(1)
  },

  /** 同じメールで、別の user_id に紐付いている顧客行 */
  async listCustomersByEmailLinkedToOthers(email: string, userId: string) {
    return supabase
      .from('customers')
      .select('id, user_id')
      .eq('email', email)
      .neq('user_id', userId) // 自分以外
      .maybeSingle()
  },

  /** メールで顧客行（id と user_id）を1件 */
  async findCustomerByEmail(email: string) {
    return supabase
      .from('customers')
      .select('id, user_id')
      .eq('email', email)
      .maybeSingle()
  },

  /** 自分の顧客行の id（更新の新しい順に1件） */
  async listOwnCustomerIdsLatestFirst(userId: string) {
    return supabase
      .from('customers')
      .select('id')
      .eq('user_id', userId)
      .order('updated_at', { ascending: false })
      .limit(1)
  },

  /** 保存後の確認用: 自分の顧客行（更新日つき、新しい順に1件） */
  async listOwnCustomersForVerify(userId: string) {
    return supabase
      .from('customers')
      .select('id, name, phone, email, updated_at')
      .eq('user_id', userId)
      .order('updated_at', { ascending: false })
      .limit(1)
  },
}

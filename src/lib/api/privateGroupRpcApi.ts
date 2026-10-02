/**
 * 貸切グループ（作成・参加・取消・メンバー削除・退出）の RPC API
 *
 * フック（usePrivateGroup）から supabase.rpc() を直接呼ばず、ここを通す（整備 Phase 2、#773）。
 * 権限・組織境界は DB 側の RPC が確認する。引数の組み立ては呼び出し側のまま。戻り値は { data, error } のまま。
 */
import { supabase } from '@/lib/supabase'

export const privateGroupRpcApi = {
  /** グループ・幹事・候補日・初回メッセージを同じトランザクションで作る */
  async createAtomic(args: Record<string, unknown>) {
    return supabase.rpc('create_private_group_atomic', args)
  },
  /** 招待コードでグループに参加する */
  async join(args: Record<string, unknown>) {
    return supabase.rpc('join_private_group', args)
  },
  /** まだリクエストされていないグループを取り消す */
  async cancelUnrequested(groupId: string) {
    return supabase.rpc('cancel_unrequested_private_group', { p_group_id: groupId })
  },
  /** メンバーをグループから外す */
  async removeMember(memberId: string) {
    return supabase.rpc('private_group_remove_member', { p_member_id: memberId })
  },
  /** グループから抜ける */
  async leave(groupId: string) {
    return supabase.rpc('private_group_leave', { p_group_id: groupId })
  },
  /** キャラクターの割り当て方法を設定する（期待値を渡して競合を検出） */
  async setCharacterMethod(args: object) {
    return supabase.rpc('private_group_set_character_method', args)
  },
  /** キャラクターの割り当てを確定する（期待値を渡して競合を検出） */
  async confirmCharacters(args: object) {
    return supabase.rpc('private_group_confirm_characters', args)
  },
  /** ゲストを PIN で認証する */
  async authenticateGuestByPin(args: object) {
    return supabase.rpc('authenticate_guest_by_pin_v3', args)
  },
  /** メンバーにクーポンを適用する */
  async applyCouponToMember(args: object) {
    return supabase.rpc('apply_coupon_to_group_member', args)
  },
  /** メンバーからクーポンを外す */
  async removeCouponFromMember(args: object) {
    return supabase.rpc('remove_coupon_from_group_member', args)
  },
  /** グループを削除する */
  async deleteGroup(args: object) {
    return supabase.rpc('delete_private_group', args)
  },
  /** 貸切リクエストを作って通知する */
  async createBookingRequestWithNotice(args: object) {
    return supabase.rpc('create_private_booking_request_with_notice', args)
  },
}


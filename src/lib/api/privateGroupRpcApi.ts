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
  /** メンバーを外し、チャットに記録する。申込済み・確定後は店舗へ人数変更を知らせる（戻り値 store_notified） */
  async removeMemberWithNotice(memberId: string) {
    return supabase.rpc('private_group_remove_member_with_notice', { p_member_id: memberId })
  },
  /** 申込前のグループを閉じ、チャットにお知らせを残す（行は消さず履歴を残す） */
  async closeUnrequestedWithNotice(groupId: string) {
    return supabase.rpc('cancel_unrequested_private_group_with_notice', { p_group_id: groupId })
  },
  /** グループから抜ける。申込後・確定後は店舗へ人数変更を知らせる（戻り値 store_notified） */
  async leave(groupId: string) {
    return supabase.rpc('private_group_leave_with_notice', { p_group_id: groupId })
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
  /** 申込前の主催者が候補を取り下げる（回答の履歴は保持） */
  async withdrawCandidate(groupId: string, candidateId: string) {
    return supabase.rpc('private_group_withdraw_candidate', { p_group_id: groupId, p_candidate_id: candidateId })
  },
  /** グループを削除する */
  async deleteGroup(args: object) {
    return supabase.rpc('delete_private_group', args)
  },
  /** 主催者の引き継ぎを依頼する（主催者のみ。宛先は会員メンバー。72 時間で期限切れ） */
  async requestHandover(groupId: string, toMemberId: string) {
    return supabase.rpc('private_group_handover_request', { p_group_id: groupId, p_to_member_id: toMemberId })
  },
  /** 主催者の引き継ぎ依頼を取り消す（依頼した本人） */
  async cancelHandover(requestId: string) {
    return supabase.rpc('private_group_handover_cancel', { p_request_id: requestId })
  },
  /** 主催者の引き継ぎを断る（宛先の本人） */
  async declineHandover(requestId: string) {
    return supabase.rpc('private_group_handover_decline', { p_request_id: requestId })
  },
  /** 主催者の引き継ぎに同意する（宛先の本人）。主催者・申込者・チャット・店舗への知らせを一括で切り替える */
  async acceptHandover(requestId: string, customerId: string, contactName: string, contactPhone: string, displayedPolicy: unknown = null) {
    return supabase.rpc('private_group_handover_accept', {
      p_request_id: requestId, p_customer_id: customerId,
      p_contact_name: contactName, p_contact_phone: contactPhone,
      p_displayed_policy: displayedPolicy ?? null,
    })
  },
  /** 引き継ぎ確認画面の材料（宛先・依頼者・同組織スタッフのみ） */
  async readHandoverDetail(requestId: string) {
    return supabase.rpc('private_group_handover_detail', { p_request_id: requestId })
  },
  /** 自分が依頼した・頼まれている進行中の引き継ぎ依頼（マイページのカード用） */
  async listMyHandovers() {
    return supabase.rpc('private_group_handover_mine')
  },
  /** 貸切リクエストを作って通知する */
  async createBookingRequestWithNotice(args: object) {
    return supabase.rpc('create_private_booking_request_with_notice', args)
  },
}


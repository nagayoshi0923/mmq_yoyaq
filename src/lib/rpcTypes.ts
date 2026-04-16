/**
 * Supabase RPC 関数の引数型定義
 *
 * 各 RPC の第2引数に使用することで、プロパティ名のタイポや型ミスを
 * コンパイル時に検出できる。
 *
 * 使用例:
 *   const params: RpcCreateReservationParams = { p_schedule_event_id: ..., ... }
 *   await supabase.rpc('create_reservation_with_lock_v2', params)
 */

// ─── 予約系 ────────────────────────────────────────────────────────────────

export interface RpcCreateReservationParams {
  p_schedule_event_id: string
  p_participant_count: number
  p_customer_id: string
  p_customer_name: string | null
  p_customer_email: string | null
  p_customer_phone: string | null
  p_notes: string | null
  p_how_found: string | null
  p_reservation_number: string
  p_customer_coupon_id: string | null
}

export interface RpcCancelReservationParams {
  p_reservation_id: string
  p_customer_id: string | null
  p_cancellation_reason: string | null
}

/** 通常キャンセル専用: 予約キャンセル + 貸切グループキャンセルを1トランザクションで実行 */
export interface RpcCancelReservationAndGroupParams {
  p_reservation_id: string
  p_customer_id: string | null
  p_cancellation_reason: string | null
}

export interface RpcUpdateReservationParticipantsParams {
  p_reservation_id: string
  p_new_count: number
  p_customer_id: string | null
}

export interface RpcRecalculateReservationPricesParams {
  p_reservation_id: string
  p_participant_names: string[] | null
}

export interface RpcAdminUpdateReservationFieldsParams {
  p_reservation_id: string
  p_updates: Record<string, unknown>
}

export interface RpcAdminDeleteReservationsByIdsParams {
  p_reservation_ids: string[]
}

export interface RpcAdminDeleteReservationsBySourceParams {
  p_reservation_source: string
}

export interface RpcAdminDeleteReservationsByScheduleEventIdsParams {
  p_schedule_event_ids: string[]
}

export interface RpcAdminRecalculateReservationPricesParams {
  p_reservation_id: string
  p_participant_names: string[] | null
}

export interface RpcChangeReservationScheduleParams {
  p_reservation_id: string
  p_new_schedule_event_id: string
  p_customer_id: string
}

// ─── 貸切予約系 ─────────────────────────────────────────────────────────────

export interface RpcCreatePrivateBookingRequestParams {
  p_scenario_id: string
  p_customer_id: string
  p_customer_name: string
  p_customer_email: string
  p_customer_phone: string
  p_participant_count: number
  /** 候補日時の構造はRPC定義に依存するため unknown */
  p_candidate_datetimes: unknown
  p_notes: string | null
  p_reservation_number: string
  p_private_group_id: string | null
}

export interface RpcApprovePrivateBookingParams {
  p_reservation_id: string
  p_selected_date: string
  p_selected_start_time: string
  p_selected_end_time: string
  p_selected_store_id: string
  p_selected_gm_id: string
  /** 候補日時の構造はRPC定義に依存するため unknown */
  p_candidate_datetimes: unknown
  p_scenario_title: string
  p_customer_name: string
  p_selected_sub_gm_id: string | null
}

// ─── グループメンバー系 ──────────────────────────────────────────────────────

export interface RpcAuthenticateGuestByPinParams {
  p_group_id: string
  p_email: string
  p_pin: string
}

export interface RpcSaveGuestAccessPinParams {
  p_member_id: string
  p_pin: string
}

export interface RpcApplyCouponToGroupMemberParams {
  p_member_id: string
  p_coupon_id: string
}

export interface RpcRemoveCouponFromGroupMemberParams {
  p_member_id: string
}

export interface RpcDeleteGuestMemberParams {
  p_member_id: string
  p_invite_code: string | null
}

export interface RpcClearCharacterSelectionFromSurveyParams {
  p_group_id: string
}

export interface RpcSetCharacterPreferenceParams {
  p_group_id: string
  p_member_id: string
  p_character_id: string
}

export interface RpcUpsertCharacterAssignmentsToSurveyParams {
  p_group_id: string
  /** メンバーIDとキャラクターIDのマッピング */
  p_assignments: Record<string, string>
}

export interface RpcSendStaffGroupMessageParams {
  p_group_id: string
  p_message: string
}

export interface RpcGetGroupMembersByInviteCodeParams {
  p_invite_code: string
}

export interface RpcGetGroupMembersByGroupIdParams {
  p_group_id: string
}

export interface RpcCheckMemberExistsParams {
  p_group_id: string
  p_user_id: string | null
  p_guest_email: string | null
}

export interface RpcGetGroupMemberCountParams {
  p_group_id: string
}

// ─── コンテンツ系 ─────────────────────────────────────────────────────────

export interface RpcGetPublicBlogPostParams {
  p_org_slug: string
  p_article_slug: string
}

export interface RpcGetAuthorByNameParams {
  p_name: string
}

export interface RpcUpsertAuthorParams {
  p_name: string
  p_email: string | null
  p_notes: string | null
}

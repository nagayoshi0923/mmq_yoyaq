/**
 * 予約ステータスの共通定義
 *
 * DBトリガー (recalc_current_participants_for_event) と一致させること。
 * 変更時はマイグレーションのトリガー定義も合わせて更新が必要。
 */
export const ACTIVE_RESERVATION_STATUSES = ['pending', 'confirmed', 'gm_confirmed', 'checked_in'] as const

export const ACTIVE_RESERVATION_STATUSES_SET = new Set<string>(ACTIVE_RESERVATION_STATUSES)

/**
 * 予約ソース（reservation_source）の定数定義
 *
 * 新しいソースを追加する場合はここだけ変更する。
 * 文字列リテラルで直接書くことは禁止（src/types/index.ts の型定義も合わせて更新すること）。
 */
export const RESERVATION_SOURCE = {
  WEB: 'web',
  PHONE: 'phone',
  WALK_IN: 'walk_in',
  EXTERNAL: 'external',
  WEB_PRIVATE: 'web_private',
  STAFF_ENTRY: 'staff_entry',
  STAFF_PARTICIPATION: 'staff_participation',
  DEMO_AUTO: 'demo_auto',
  DEMO: 'demo',
} as const

export type ReservationSource = typeof RESERVATION_SOURCE[keyof typeof RESERVATION_SOURCE]

/**
 * global_settings テーブルのシステムメッセージ SELECT 文字列
 *
 * 複数ファイルから global_settings を参照する際は必ずこの定数を使うこと。
 * カラムを追加・変更する場合はここだけ変更すれば全呼び出し元に反映される。
 * 新しいユースケースを追加する場合は新しいキーを追加する。
 */
export const GLOBAL_SETTINGS_MSG_SELECT = {
  /** グループ作成時のメッセージ */
  GROUP_CREATED: 'system_msg_group_created_title, system_msg_group_created_body, system_msg_group_created_note',
  /** 貸切リクエスト送信時のメッセージ */
  BOOKING_REQUESTED: 'system_msg_booking_requested_title, system_msg_booking_requested_body',
  /** 日程確定時のメッセージ */
  SCHEDULE_CONFIRMED: 'system_msg_schedule_confirmed_title, system_msg_schedule_confirmed_body',
  /** 日程却下時のメッセージ */
  BOOKING_REJECTED: 'system_msg_booking_rejected_title, system_msg_booking_rejected_body',
  /** キャンセル時のメッセージ */
  BOOKING_CANCELLED: 'system_msg_booking_cancelled_title, system_msg_booking_cancelled_body',
  /** グループ作成 + リクエスト送信（usePrivateGroup用） */
  GROUP_AND_BOOKING: 'system_msg_group_created_title, system_msg_group_created_body, system_msg_group_created_note, system_msg_booking_requested_title, system_msg_booking_requested_body, system_msg_schedule_confirmed_title, system_msg_schedule_confirmed_body',
} as const

/** スタッフ系予約ソース（スタッフ参加者としてカウントされる） */
export const STAFF_RESERVATION_SOURCES = [
  RESERVATION_SOURCE.STAFF_ENTRY,
  RESERVATION_SOURCE.STAFF_PARTICIPATION,
] as const

/** 自動管理されるスタッフ予約（GMスタッフ欄から自動作成・削除される） */
export const AUTO_MANAGED_STAFF_SOURCES = [RESERVATION_SOURCE.STAFF_ENTRY] as const

/** デモ系予約ソース */
export const DEMO_RESERVATION_SOURCES = [
  RESERVATION_SOURCE.DEMO,
  RESERVATION_SOURCE.DEMO_AUTO,
] as const

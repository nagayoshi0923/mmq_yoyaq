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

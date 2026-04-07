/**
 * 予約ステータスの共通定義
 *
 * DBトリガー (recalc_current_participants_for_event) と一致させること。
 * 変更時はマイグレーションのトリガー定義も合わせて更新が必要。
 */
export const ACTIVE_RESERVATION_STATUSES = ['pending', 'confirmed', 'gm_confirmed', 'checked_in'] as const

export const ACTIVE_RESERVATION_STATUSES_SET = new Set<string>(ACTIVE_RESERVATION_STATUSES)

/**
 * 退会時にブロックする予約ステータス（取消・完了・不参加以外の進行中〜確定）
 * Edge Function delete-my-account の判定と同期すること
 */
export const RESERVATION_STATUSES_BLOCKING_WITHDRAWAL = [
  'pending',
  'confirmed',
  'gm_confirmed',
  'pending_gm',
  'pending_store',
] as const

export type BlockingWithdrawalReservationStatus =
  (typeof RESERVATION_STATUSES_BLOCKING_WITHDRAWAL)[number]

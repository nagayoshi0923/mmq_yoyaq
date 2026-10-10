/**
 * 貸切グループの日程まわりの決まり（グループ画面とマイページで共通）。
 */

/**
 * 店舗への貸切リクエスト送付済み（未キャンセルの予約が紐づく）の間は、
 * 候補日追加・希望店舗編集・予約リクエスト作成を禁止（グループ status の更新遅延にも対応）
 */
export function canMutateScheduleBeforeStoreReply(
  group: { status: string; reservation_id?: string | null } | null | undefined,
  linkedReservationStatus: string | null | undefined,
): boolean {
  if (!group) return false
  if (group.status === 'booking_requested' || group.status === 'confirmed') return false
  if (!(group.status === 'gathering' || group.status === 'date_adjusting')) return false
  if (group.reservation_id) {
    return linkedReservationStatus === 'cancelled'
  }
  return true
}

/** 参加完了画面などで使う、グループの進み具合（募集中／店舗へ申込済み／確定済み） */
export type PrivateGroupProgress = 'gathering' | 'requested' | 'confirmed'

export function privateGroupProgress(
  group: { status: string; reservation_id?: string | null } | null | undefined,
  linkedReservationStatus: string | null | undefined,
): PrivateGroupProgress {
  if (!group) return 'gathering'
  if (group.status === 'confirmed' || linkedReservationStatus === 'confirmed') return 'confirmed'
  if (group.status === 'booking_requested') return 'requested'
  if (group.reservation_id && linkedReservationStatus !== 'cancelled') return 'requested'
  return 'gathering'
}

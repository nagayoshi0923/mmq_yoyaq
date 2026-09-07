/**
 * 予約キャンセル時に、紐づく貸切公演を中止するか。
 *
 * - 店舗の却下（cancelPrivateEventRequested）: 貸切公演なら中止
 * - 顧客の予約サイトキャンセル: 貸切公演かつ他に有効予約が残っていなければ中止
 * - スタッフが予約だけ消す操作・手入力の空枠: 中止しない
 */
export function shouldCancelLinkedPrivateEvent(input: {
  cancelPrivateEventRequested: boolean
  isCustomerSelfCancel: boolean
  event: {
    category?: string | null
    is_private_booking?: boolean | null
    is_cancelled?: boolean | null
  } | null
  remainingActiveReservationCount: number
}): boolean {
  if (!input.event || input.event.is_cancelled === true) return false
  const isPrivate =
    input.event.category === 'private' || input.event.is_private_booking === true
  if (!isPrivate) return false
  if (input.cancelPrivateEventRequested) return true
  return input.isCustomerSelfCancel && input.remainingActiveReservationCount === 0
}

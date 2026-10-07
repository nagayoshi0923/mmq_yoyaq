/** HTTP成功と通知処理の成功を分ける。受信者への到達を保証するものではない。 */
export type NotificationOutcome =
  | { status: 'accepted' }
  | { status: 'skipped'; reason: string }
  | { status: 'failed'; reason: 'invoke_error' | 'unsuccessful_response' | 'partial_failure' | 'exception' | 'reservation_unavailable' }

export function notificationOutcome(response: { data: unknown; error: unknown }): NotificationOutcome {
  if (response.error) return { status: 'failed', reason: 'invoke_error' }
  const data = response.data
  if (!data || typeof data !== 'object' || !('success' in data) || data.success !== true) {
    return { status: 'failed', reason: 'unsuccessful_response' }
  }
  if ('failedCount' in data && typeof data.failedCount === 'number' && data.failedCount > 0) {
    return { status: 'failed', reason: 'partial_failure' }
  }
  if ('email_sent' in data && data.email_sent === false) return { status: 'failed', reason: 'unsuccessful_response' }
  if ('skipped' in data && data.skipped === true) return { status: 'skipped', reason: 'provider_skipped' }
  return { status: 'accepted' }
}

export const SAVED_NOTIFICATION_WARNING = '変更は保存しましたが、通知メールの送信を確認できませんでした。'
export const SAVED_NOTIFICATION_DETAIL = '再保存せず、通知履歴と送信状況を確認してください。自動再送は行いません。'

/** 待機列は notified=0 かつ total 欠落/0 が対象なし・設定不足。total>0 の全失敗は partial_failure。 */
export type WaitlistNotificationOutcome = NotificationOutcome | { status: 'unconfirmed'; reason: 'zero_or_unconfirmed' | 'internal_error_response' }
export function waitlistNotificationOutcome(response: { data: unknown; error: unknown }): WaitlistNotificationOutcome {
  const outcome = notificationOutcome(response)
  if (outcome.status !== 'accepted') return outcome
  const data = response.data as Record<string, unknown>
  if ('_debug' in data) return { status: 'unconfirmed', reason: 'internal_error_response' }
  const notified = data.notifiedCount, total = data.totalWaitlist
  if (typeof notified !== 'number' || !Number.isInteger(notified) || notified < 0) {
    return { status: 'failed', reason: 'unsuccessful_response' }
  }
  if (notified === 0) {
    if (typeof total === 'number' && Number.isInteger(total) && total > 0) {
      return { status: 'failed', reason: 'partial_failure' }
    }
    return { status: 'unconfirmed', reason: 'zero_or_unconfirmed' }
  }
  if (typeof total !== 'number' || !Number.isInteger(total) || total < notified) {
    return { status: 'failed', reason: 'unsuccessful_response' }
  }
  return notified === total ? { status: 'accepted' } : { status: 'failed', reason: 'partial_failure' }
}

/** 作成/skipの肯定応答を取消チャンネル操作の完了と読み替えない。 */
export function discordCancellationOutcome(response: { data: unknown; error: unknown }): NotificationOutcome {
  const outcome = notificationOutcome(response)
  if (outcome.status !== 'accepted') return outcome
  return (response.data as Record<string, unknown>).cancelled === true
    ? outcome : { status: 'failed', reason: 'unsuccessful_response' }
}

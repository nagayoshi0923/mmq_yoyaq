import { logger } from '@/utils/logger'

export type CancelEventReservationTarget = {
  id: string
  customer_id?: string | null
  reservation_number?: string | null
  customer_name?: string | null
}

export type CancelEventReservationsSeriallyParams<T extends CancelEventReservationTarget> = {
  reservations: T[]
  reason: string
  sendMail: boolean
  cancelWithLock: (
    reservationId: string,
    customerId: string | null,
    reason?: string
  ) => Promise<boolean>
  sendCancellationEmail?: (reservation: T) => Promise<void>
}

/** 取消とメールの部分失敗。画面にはこの確定済みの結果だけを表示する。 */
export class EventCancellationPartialError extends Error {
  constructor(
    readonly cancellationFailures: string[],
    readonly emailFailures: string[],
  ) {
    const details = ['公演は中止しました。']
    if (cancellationFailures.length) {
      details.push(`${cancellationFailures.length}件の予約キャンセルに失敗しました（${cancellationFailures.join('、')}）。予約管理で該当予約を確認して取り消してください。`)
    }
    if (emailFailures.length) {
      details.push(`取消済みの${emailFailures.length}件はメールの送信を確認できません（${emailFailures.join('、')}）。メール履歴を確認し、未送信の場合のみ再送してください。`)
    }
    super(details.join(''))
    this.name = 'EventCancellationPartialError'
  }
}

/** 同じ公演行の NOWAIT ロックを競合させず、取消成功分だけ通知する。 */
export async function cancelEventReservationsSerially<T extends CancelEventReservationTarget>(
  params: CancelEventReservationsSeriallyParams<T>
): Promise<number> {
  const { reservations, reason, sendMail, cancelWithLock, sendCancellationEmail } = params
  const cancellationFailures: string[] = []
  const emailFailures: string[] = []
  let cancelledCount = 0

  for (const reservation of reservations) {
    const label = String(reservation.reservation_number || reservation.id)
    try {
      const cancelled = await cancelWithLock(reservation.id, reservation.customer_id ?? null, reason)
      if (cancelled !== true) throw new Error('予約取消の成功を確認できません')
      cancelledCount += 1
    } catch (error) {
      logger.error(`予約${label}のキャンセル更新エラー:`, error)
      cancellationFailures.push(label)
      continue
    }
    if (!sendMail) continue
    try {
      if (!sendCancellationEmail) throw new Error('メール送信処理がありません')
      await sendCancellationEmail(reservation)
    } catch (error) {
      logger.error(`予約${label}へのメール送信エラー:`, error)
      emailFailures.push(label)
    }
  }

  if (cancellationFailures.length || emailFailures.length) {
    throw new EventCancellationPartialError(cancellationFailures, emailFailures)
  }
  return cancelledCount
}

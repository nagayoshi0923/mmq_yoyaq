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

/**
 * 同一公演の複数予約を直列で cancelWithLock する。
 * 並列だと schedule_events の FOR UPDATE NOWAIT で lock_not_available になる。
 * 取消成功時のみメール送信。失敗は集約して throw する。
 */
export async function cancelEventReservationsSerially<T extends CancelEventReservationTarget>(
  params: CancelEventReservationsSeriallyParams<T>
): Promise<void> {
  const { reservations, reason, sendMail, cancelWithLock, sendCancellationEmail } = params
  const failures: string[] = []

  for (const reservation of reservations) {
    try {
      await cancelWithLock(reservation.id, reservation.customer_id ?? null, reason)
      logger.log(`予約${reservation.reservation_number}をキャンセル済みに更新`)

      if (!sendMail || !sendCancellationEmail) continue
      try {
        await sendCancellationEmail(reservation)
      } catch (emailErr) {
        logger.error(`予約${reservation.reservation_number}へのメール送信エラー:`, emailErr)
      }
    } catch (cancelError) {
      logger.error(`予約${reservation.reservation_number}のキャンセル更新エラー:`, cancelError)
      failures.push(
        String(reservation.reservation_number || reservation.customer_name || reservation.id)
      )
    }
  }

  if (failures.length > 0) {
    throw new Error(
      `公演は中止しましたが、${failures.length}件の予約キャンセルに失敗しました（${failures.join('、')}）。` +
        'もう一度お試しください。'
    )
  }
}

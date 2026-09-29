import { describe, expect, it, vi } from 'vitest'
import {
  cancelEventReservationsSerially,
  type CancelEventReservationTarget,
} from './cancelEventReservationsSerially'

vi.mock('@/utils/logger', () => ({
  logger: { log: vi.fn(), error: vi.fn(), warn: vi.fn() },
}))

const reservations: CancelEventReservationTarget[] = [
  { id: 'r1', customer_id: 'c1', reservation_number: 'A-1' },
  { id: 'r2', customer_id: 'c2', reservation_number: 'A-2' },
  { id: 'r3', customer_id: 'c3', reservation_number: 'A-3' },
]

describe('cancelEventReservationsSerially', () => {
  it('cancelWithLock を直列で呼び、同時 inflight が1を超えない', async () => {
    let inflight = 0
    let maxInflight = 0
    const order: string[] = []
    const cancelWithLock = vi.fn(async (id: string) => {
      inflight += 1
      maxInflight = Math.max(maxInflight, inflight)
      order.push(`start:${id}`)
      await Promise.resolve()
      order.push(`end:${id}`)
      inflight -= 1
      return true
    })
    const sendCancellationEmail = vi.fn(
      async (_reservation: CancelEventReservationTarget) => undefined
    )

    await cancelEventReservationsSerially({
      reservations,
      reason: '公演中止',
      sendMail: true,
      cancelWithLock,
      sendCancellationEmail,
    })

    expect(maxInflight).toBe(1)
    expect(order).toEqual([
      'start:r1', 'end:r1',
      'start:r2', 'end:r2',
      'start:r3', 'end:r3',
    ])
    expect(sendCancellationEmail).toHaveBeenCalledTimes(3)
  })

  it('取消失敗した予約にはメールを送らず、残りは続行したうえで集約エラーを投げる', async () => {
    const cancelWithLock = vi.fn(async (id: string) => {
      if (id === 'r2') throw new Error('lock_not_available')
      return true
    })
    const sendCancellationEmail = vi.fn(
      async (_reservation: CancelEventReservationTarget) => undefined
    )

    await expect(
      cancelEventReservationsSerially({
        reservations,
        reason: '公演中止',
        sendMail: true,
        cancelWithLock,
        sendCancellationEmail,
      })
    ).rejects.toThrow(/1件の予約キャンセルに失敗/)

    expect(cancelWithLock).toHaveBeenCalledTimes(3)
    expect(sendCancellationEmail).toHaveBeenCalledTimes(2)
    expect(sendCancellationEmail.mock.calls.map(call => call[0].id)).toEqual(['r1', 'r3'])
  })

  it('メール送信が停止しても、その前に全予約の取消が完了している', async () => {
    const cancelWithLock = vi.fn(async () => true)
    let releaseMail!: () => void
    let mailStarted!: () => void
    const started = new Promise<void>(resolve => { mailStarted = resolve })
    const pendingMail = new Promise<void>(resolve => { releaseMail = resolve })
    const sendCancellationEmail = vi.fn(async () => {
      mailStarted()
      await pendingMail
    })
    const result = cancelEventReservationsSerially({
      reservations, reason: '公演中止', sendMail: true, cancelWithLock, sendCancellationEmail,
    })
    await started
    expect(cancelWithLock).toHaveBeenCalledTimes(3)
    expect(sendCancellationEmail).toHaveBeenCalledTimes(1)
    releaseMail()
    await expect(result).resolves.toBe(3)
  })

  it('sendMail=false のときは取消成功でもメールを送らない', async () => {
    const cancelWithLock = vi.fn(async () => true)
    const sendCancellationEmail = vi.fn(
      async (_reservation: CancelEventReservationTarget) => undefined
    )

    await cancelEventReservationsSerially({
      reservations: [reservations[0]!],
      reason: '公演中止',
      sendMail: false,
      cancelWithLock,
      sendCancellationEmail,
    })

    expect(cancelWithLock).toHaveBeenCalledTimes(1)
    expect(sendCancellationEmail).not.toHaveBeenCalled()
  })
})

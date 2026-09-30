import { describe, expect, it } from 'vitest'
import { notificationOutcome, waitlistNotificationOutcome, discordCancellationOutcome } from './notificationResult'
describe('通知応答の共通判定', () => {
  it.each([
    [{ data: { success: true }, error: null }, 'accepted'],
    [{ data: { success: false }, error: null }, 'failed'],
    [{ data: { success: 'true' }, error: null }, 'failed'],
    [{ data: { success: true }, error: { message: 'HTTP error' } }, 'failed'],
    [{ data: null, error: null }, 'failed'],
    [{ data: {}, error: null }, 'failed'],
    [{ data: 'success', error: null }, 'failed'],
    [{ data: { success: true, skipped: true }, error: null }, 'skipped'],
    [{ data: { success: false, skipped: true }, error: null }, 'failed'],
    [{ data: { success: true, failedCount: 1, sentCount: 1 }, error: null }, 'failed'],
    [{ data: { success: true, failedCount: 0 }, error: null }, 'accepted'],
  ])('返却%sを%sとして扱う', (response, status) => {
    expect(notificationOutcome(response)).toMatchObject({ status })
  })
})

it.each([
  [{ success: true, notifiedCount: 2, totalWaitlist: 2 }, 'accepted'],
  [{ success: true, notifiedCount: 1, totalWaitlist: 2 }, 'failed'],
  [{ success: true, notifiedCount: 0, totalWaitlist: 2 }, 'failed'],
  [{ success: true, notifiedCount: 0 }, 'unconfirmed'],
  [{ success: true, notifiedCount: 0, totalWaitlist: 0 }, 'unconfirmed'],
  [{ success: true, notifiedCount: 0, _debug: 'internal error' }, 'unconfirmed'],
  [{ success: true, notifiedCount: -1 }, 'failed'],
  [{ success: true, notifiedCount: 2, totalWaitlist: 1 }, 'failed'],
  [{ success: true, notifiedCount: '2', totalWaitlist: 2 }, 'failed'],
  [{ success: true, notifiedCount: 1 }, 'failed'],
])('待機列の件数契約%sを%sと分類する', (data, status) => {
  expect(waitlistNotificationOutcome({ data, error: null })).toMatchObject({ status })
})
it('対象ありの全件失敗は partial_failure', () => {
  expect(waitlistNotificationOutcome({
    data: { success: true, notifiedCount: 0, totalWaitlist: 2 },
    error: null,
  })).toEqual({ status: 'failed', reason: 'partial_failure' })
})
it('Discordの作成肯定応答は取消成功にならない', () => {
  expect(discordCancellationOutcome({ data: { success: true, created: true }, error: null }).status).toBe('failed')
})

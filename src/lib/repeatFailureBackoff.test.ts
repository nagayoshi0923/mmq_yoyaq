import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { backoffDelayMs, requestKey, resetRepeatFailureBackoff, withRepeatFailureBackoff } from './repeatFailureBackoff'

describe('同じ保存が続けて失敗したら間を空ける', () => {
  beforeEach(() => { resetRepeatFailureBackoff(); vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-13T00:00:00Z')) })
  afterEach(() => { vi.useRealTimers() })

  it('3 回失敗するまでは待たず、以後は前回の失敗から 10 秒空けて送り、成功で数が消える', async () => {
    const key = requestKey('date_responses', [{ candidateDateId: 'x', response: 'ok' }])
    const sent: number[] = []
    let fail = true
    const send = () => withRepeatFailureBackoff(key, async () => { sent.push(Date.now()); return { error: fail ? 'x' : null } }, r => Boolean(r.error))
    for (let i = 0; i < 3; i++) await send()
    expect(sent.map(t => t - sent[0])).toEqual([0, 0, 0])
    expect(backoffDelayMs(key)).toBe(10_000)
    const fourth = send()
    await vi.advanceTimersByTimeAsync(9_999)
    expect(sent).toHaveLength(3)
    await vi.advanceTimersByTimeAsync(1)
    await fourth
    expect(sent).toHaveLength(4)
    expect(backoffDelayMs(requestKey('date_responses', [{ candidateDateId: 'y', response: 'ok' }]))).toBe(0)
    fail = false
    const fifth = send()
    await vi.advanceTimersByTimeAsync(10_000)
    await fifth
    expect(backoffDelayMs(key)).toBe(0)
  })

  it('例外で終わった送信も失敗として数え、例外はそのまま返す', async () => {
    const key = requestKey('POST /api/x', '{}')
    for (let i = 0; i < 3; i++) {
      await expect(withRepeatFailureBackoff(key, async () => { throw new Error('boom') }, () => false)).rejects.toThrow('boom')
    }
    expect(backoffDelayMs(key)).toBe(10_000)
  })
})

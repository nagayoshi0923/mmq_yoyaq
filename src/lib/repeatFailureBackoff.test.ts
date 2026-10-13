// @vitest-environment jsdom
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { backoffDelayMs, requestKey, resetRepeatFailureBackoff, withRepeatFailureBackoff } from './repeatFailureBackoff'

describe('失敗ループと古い要求の遅延送信を止める', () => {
  beforeEach(() => { localStorage.clear(); resetRepeatFailureBackoff(); vi.useFakeTimers() })
  afterEach(() => { vi.useRealTimers() })
  it('失敗3回後の古い回答を破棄し、10秒後に最新回答だけを送る', async () => {
    const scope = requestKey('answer', 'old')
    const sent: string[] = []
    const send = (value: string, failed = true) => withRepeatFailureBackoff(scope, async () => { sent.push(value); return { error: failed } }, r => r.error)
    for (let i = 0; i < 3; i++) await send('old')
    await expect(send('old')).rejects.toThrow('最新内容')
    await vi.advanceTimersByTimeAsync(10000)
    await send('new', false)
    expect(sent).toEqual(['old', 'old', 'old', 'new'])
    await vi.advanceTimersByTimeAsync(10000)
    expect(sent.at(-1)).toBe('new')
    expect(backoffDelayMs(scope)).toBe(0)
  })
  it('同じ操作の並列100要求でも送信は1件、拒否した要求を後送しない', async () => {
    let finish!: (r: boolean) => void
    const send = vi.fn(() => new Promise<boolean>(resolve => { finish = resolve }))
    const first = withRepeatFailureBackoff('parallel', send, r => r)
    const others = await Promise.allSettled(Array.from({length:100}, () => withRepeatFailureBackoff('parallel', send, r => r)))
    expect(others.every(r => r.status === 'rejected')).toBe(true)
    expect(send).toHaveBeenCalledTimes(1)
    finish(false); await first
    await vi.advanceTimersByTimeAsync(20000)
    expect(send).toHaveBeenCalledTimes(1)
  })
  it('リロード相当のメモリ消去後も失敗を保持し、保存内容は残さない', async () => {
    const key = requestKey('answer', { email: 'secret@example.invalid' })
    for (let i = 0; i < 3; i++) await withRepeatFailureBackoff(key, async () => true, Boolean)
    resetRepeatFailureBackoff()
    expect(backoffDelayMs(key)).toBe(10000)
    expect(JSON.stringify(localStorage)).not.toContain('secret')
    await expect(withRepeatFailureBackoff(key, async () => false, Boolean)).rejects.toThrow()
  })
  it('例外を数え、成功後は次の保存を受け付ける', async () => {
    for (let i = 0; i < 3; i++) await expect(withRepeatFailureBackoff('exception', async () => { throw Error('fail') }, Boolean)).rejects.toThrow('fail')
    expect(backoffDelayMs('exception')).toBe(10000)
    await vi.advanceTimersByTimeAsync(10000)
    await withRepeatFailureBackoff('exception', async () => false, Boolean)
    expect(backoffDelayMs('exception')).toBe(0)
  })
})

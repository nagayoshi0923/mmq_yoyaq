import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createRealtimeRefetcher } from './scheduleRealtimeRefetch'

describe('Realtime 通知からの取り直し', () => {
  beforeEach(() => { vi.useFakeTimers() })
  afterEach(() => { vi.useRealTimers() })
  it('500ms 以内の連続通知は 1 回にまとめる', () => {
    const invalidate = vi.fn()
    const refetcher = createRealtimeRefetcher({ isFetching: () => false, invalidate })
    refetcher.notify(); vi.advanceTimersByTime(300); refetcher.notify(); vi.advanceTimersByTime(499)
    expect(invalidate).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(invalidate).toHaveBeenCalledTimes(1)
  })
  it('取得中に来た通知は捨てず、取得の完了後に取り直す', () => {
    let fetching = true
    const invalidate = vi.fn()
    const refetcher = createRealtimeRefetcher({ isFetching: () => fetching, invalidate })
    refetcher.notify(); vi.advanceTimersByTime(500)
    expect(invalidate).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1500)
    expect(invalidate).not.toHaveBeenCalled()
    fetching = false
    vi.advanceTimersByTime(500)
    expect(invalidate).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(5000)
    expect(invalidate).toHaveBeenCalledTimes(1)
  })
  it('購読解除後は取り直さない', () => {
    const invalidate = vi.fn()
    const refetcher = createRealtimeRefetcher({ isFetching: () => false, invalidate })
    refetcher.notify(); refetcher.dispose(); vi.advanceTimersByTime(1000)
    expect(invalidate).not.toHaveBeenCalled()
  })
})

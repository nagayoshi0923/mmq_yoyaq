// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { msUntilNextJstMidnight, useJstToday } from './useJstToday'

let root: Root
let host: HTMLDivElement
function Probe() { return <span>{useJstToday()}</span> }

beforeEach(() => {
  vi.useFakeTimers()
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  host = document.createElement('div'); document.body.append(host); root = createRoot(host)
})
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.useRealTimers() })

describe('useJstToday', () => {
  it('次の日本時間 0 時までの時間を数える', () => {
    // 2026-10-20 23:59:59 JST
    expect(msUntilNextJstMidnight(new Date('2026-10-20T14:59:59Z'))).toBe(1000 + 250)
    // 2026-10-21 00:00:00 JST ちょうど → 翌日の 0 時まで
    expect(msUntilNextJstMidnight(new Date('2026-10-20T15:00:00Z'))).toBe(24 * 3600 * 1000 + 250)
  })

  it('開いたまま 23:59:59 → 00:00:01 をまたぐと翌日に切り替わる', async () => {
    vi.setSystemTime(new Date('2026-10-20T14:59:59Z'))
    await act(async () => root.render(<Probe />))
    expect(host.textContent).toBe('2026-10-20')
    await act(async () => { vi.advanceTimersByTime(2000) })
    expect(host.textContent).toBe('2026-10-21')
  })

  it('タイマーが遅れても画面に戻ったとき（visibilitychange）に読み直す', async () => {
    vi.setSystemTime(new Date('2026-10-20T14:59:59Z'))
    await act(async () => root.render(<Probe />))
    // スリープ中はタイマーが進まない想定: 時計だけ進める
    vi.setSystemTime(new Date('2026-10-20T15:00:01Z'))
    expect(host.textContent).toBe('2026-10-20')
    await act(async () => { document.dispatchEvent(new Event('visibilitychange')) })
    expect(host.textContent).toBe('2026-10-21')
  })

  it('フォーカスが戻ったときも読み直す', async () => {
    vi.setSystemTime(new Date('2026-10-20T14:59:59Z'))
    await act(async () => root.render(<Probe />))
    vi.setSystemTime(new Date('2026-10-20T15:00:01Z'))
    await act(async () => { window.dispatchEvent(new Event('focus')) })
    expect(host.textContent).toBe('2026-10-21')
  })
})

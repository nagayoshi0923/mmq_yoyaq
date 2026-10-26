// @vitest-environment jsdom
// 二度押し（同じ描画のうちに 2 回）で同じ保存を 2 回しない。終われば別の操作（別日の再プレイの追加）は受け付ける（点検 F07）
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { describe, expect, it, vi } from 'vitest'
import { useSingleFlight } from './useSingleFlight'

describe('useSingleFlight', () => {
  it('終わるまで 2 回目を受け付けず、終われば（失敗でも）また受け付ける', async () => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
    let release!: () => void
    const save = vi.fn(() => new Promise<void>((r) => { release = r }))
    let run!: () => Promise<void>
    function P() { run = useSingleFlight(save); return null }
    const root = createRoot(document.createElement('div'))
    await act(async () => root.render(<P />))
    let first!: Promise<void>
    await act(async () => { first = run(); void run() })
    expect(save).toHaveBeenCalledTimes(1)
    await act(async () => { release(); await first })
    save.mockImplementationOnce(() => Promise.reject(new Error('boom')))
    await act(async () => { await run().catch(() => {}) })
    await act(async () => { const p = run(); release(); await p })
    expect(save).toHaveBeenCalledTimes(3)
    await act(async () => root.unmount())
  })
})

// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'

const MODULE = './pendingEventCreate'
const a = { requestId: 'aaaaaaaa-0000-4000-8000-000000000001', fingerprint: 'A', summary: 'A', at: '2026-10-22T00:00:01Z' }
const b = { requestId: 'bbbbbbbb-0000-4000-8000-000000000002', fingerprint: 'B', summary: 'B', at: '2026-10-22T00:00:02Z' }
afterEach(() => { vi.restoreAllMocks(); localStorage.clear() })

describe('未確定の作成の記録（PR #1210 Codex 再レビュー a649ec3 の 1）', () => {
  it('別タブ相当の書き込みが重なっても、他のタブの要求を消さない（再読み込み後も両方を照合できる）', async () => {
    localStorage.clear()
    vi.resetModules(); const tabA = await import(MODULE)
    vi.resetModules(); const tabB = await import(MODULE)
    // タブ A が書く直前に、タブ B が別の要求を書く（読んで足して書き戻す形だと、ここで B が消えた）
    const originalSet = Storage.prototype.setItem
    let once = true
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, key: string, value: string) {
      if (once) { once = false; tabB.addPendingEventCreate('org', 'user', b) }
      return originalSet.call(this, key, value)
    })
    expect(tabA.addPendingEventCreate('org', 'user', a)).toBe(true)
    vi.restoreAllMocks()
    vi.resetModules(); const afterReload = await import(MODULE)
    expect(afterReload.listPendingEventCreates('org', 'user').map((e: { requestId: string }) => e.requestId)).toEqual([a.requestId, b.requestId])
  })
  it('確定した要求を消しても、他の要求・他の利用者の要求は残る', async () => {
    vi.resetModules(); const m = await import(MODULE)
    m.addPendingEventCreate('org', 'user', a); m.addPendingEventCreate('org', 'user', b); m.addPendingEventCreate('org', 'other', a)
    m.removePendingEventCreate('org', 'user', a.requestId)
    vi.resetModules(); const afterReload = await import(MODULE)
    expect(afterReload.listPendingEventCreates('org', 'user').map((e: { requestId: string }) => e.requestId)).toEqual([b.requestId])
    expect(afterReload.listPendingEventCreates('org', 'other').map((e: { requestId: string }) => e.requestId)).toEqual([a.requestId])
  })
})

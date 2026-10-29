// @vitest-environment jsdom
// 2026-10-29 Codex レビュー: 選び直しのログアウトが SDK を直接呼び、明示ログアウトの印が立たないため、SIGNED_OUT のあとに
// バックアップからの復旧（tryRecoverSession）が同じ利用者のセッションを戻し、ログイン画面から同じ案内へ戻っていた。
// 本物の useAuthLifecycle・createAuthActions・案内の画面を組み合わせて確かめる（SDK は架空。通信なし）
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
const m = vi.hoisted(() => ({ callback: null as null | ((e: string, s: null) => void | Promise<void>), signOut: vi.fn(), recover: vi.fn(async () => true) }))
vi.mock('@/lib/supabase', () => ({ supabase: { auth: {
  onAuthStateChange: (cb: typeof m.callback) => { m.callback = cb; return { data: { subscription: { unsubscribe: () => {} } } } },
  signOut: m.signOut,
} } }))
vi.mock('@/lib/webPush', () => ({ removeWebPushSubscription: vi.fn(async () => {}) }))
vi.mock('@/lib/persistedQueryCache', () => ({ clearPersistedQueryCache: vi.fn(async () => {}) }))
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({}) }))
import { useAuthLifecycle, type AuthLifecycleDeps } from './useAuthLifecycle'
import { createAuthActions } from './authActions'
import { DuplicateAccountScreen } from '@/pages/completeProfile/StatusScreens'

function makeRefs() {
  return {
    userRef: { current: { id: 'fixture-user', role: 'customer' } as never }, broadcastChannelRef: { current: null }, isExplicitSignOutRef: { current: false },
    recoveryAttemptedRef: { current: false }, isProcessingRef: { current: false },
    setUser: vi.fn(), setStaffCache: vi.fn(), setLoading: vi.fn(), setIsInitialized: vi.fn(),
  }
}
beforeEach(() => { Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true }); m.callback = null; m.signOut.mockReset(); m.recover.mockClear() })

describe('ログイン方法を選び直すためのログアウト', () => {
  it('本物のライフサイクルと組み合わせても、SIGNED_OUT のあとにバックアップからの復旧を起こさず、ログイン画面へ移る', async () => {
    // 実際の SDK と同じく、SIGNED_OUT を知らせてから少しして signOut が返る（その間にライフサイクルが SIGNED_OUT を処理する）
    m.signOut.mockImplementation(async () => { m.callback?.('SIGNED_OUT', null); await new Promise((res) => setTimeout(res, 10)); return { error: null } })
    const r = makeRefs()
    const actions = createAuthActions({ userRef: r.userRef, broadcastChannelRef: r.broadcastChannelRef, isExplicitSignOutRef: r.isExplicitSignOutRef, setUser: r.setUser, setStaffCache: r.setStaffCache, setLoading: r.setLoading })
    const deps = { loading: false, resolveDeps: {}, getInitialSession: vi.fn(async () => {}), tryRecoverSession: m.recover, refreshSession: vi.fn(async () => {}), ...r } as unknown as AuthLifecycleDeps
    const go = vi.fn()
    function Fixture() { useAuthLifecycle(deps); return <DuplicateAccountScreen userEmail="fixture@example.invalid" go={go} signOutForRelogin={() => actions.signOutForRelogin()} /> }
    const host = document.createElement('div'); const root = createRoot(host)
    try {
      await act(async () => root.render(<MemoryRouter><Fixture /></MemoryRouter>))
      await act(async () => { (host.querySelector('[data-testid="duplicate-account-choose-again"]') as HTMLButtonElement).click(); await new Promise((res) => setTimeout(res, 20)) })
      expect(m.signOut).toHaveBeenCalledWith({ scope: 'local' })
      expect(m.recover).not.toHaveBeenCalled()
      expect(go).toHaveBeenCalledWith('/login')
    } finally { await act(async () => root.unmount()) }
  })

  it('（対照）以前のように SDK を直接呼ぶと、同じ流れで復旧が走る（この試験が問題を見分けられること）', async () => {
    m.signOut.mockImplementation(async () => { m.callback?.('SIGNED_OUT', null); await new Promise((res) => setTimeout(res, 10)); return { error: null } })
    const r = makeRefs()
    const deps = { loading: false, resolveDeps: {}, getInitialSession: vi.fn(async () => {}), tryRecoverSession: m.recover, refreshSession: vi.fn(async () => {}), ...r } as unknown as AuthLifecycleDeps
    const go = vi.fn()
    const directSignOut = async (): Promise<'ok' | 'failed' | 'timeout'> => { const { error } = await m.signOut({ scope: 'local' }); return error ? 'failed' : 'ok' }
    function Fixture() { useAuthLifecycle(deps); return <DuplicateAccountScreen userEmail="fixture@example.invalid" go={go} signOutForRelogin={directSignOut} /> }
    const host = document.createElement('div'); const root = createRoot(host)
    try {
      await act(async () => root.render(<MemoryRouter><Fixture /></MemoryRouter>))
      await act(async () => { (host.querySelector('[data-testid="duplicate-account-choose-again"]') as HTMLButtonElement).click(); await new Promise((res) => setTimeout(res, 20)) })
      expect(m.recover).toHaveBeenCalledTimes(1)
    } finally { await act(async () => root.unmount()) }
  })

  it.each([
    ['{ error } が返る', async () => ({ error: { message: 'boom' } }), 'failed', false],
    ['投げる', async () => { throw new Error('network') }, 'failed', false],
  ])('ログアウトが失敗（%s）したら failed、明示ログアウトの印を戻す（利用者情報は消さない）', async (_l, impl, want, flag) => {
    m.signOut.mockImplementation(impl)
    const r = makeRefs()
    const actions = createAuthActions({ userRef: r.userRef, broadcastChannelRef: r.broadcastChannelRef, isExplicitSignOutRef: r.isExplicitSignOutRef, setUser: r.setUser, setStaffCache: r.setStaffCache, setLoading: r.setLoading })
    expect(await actions.signOutForRelogin()).toBe(want)
    expect(r.isExplicitSignOutRef.current).toBe(flag)
    expect(r.setUser).not.toHaveBeenCalled()
  })

  it('返ってこなければ上限で timeout。印は残す（遅れて SIGNED_OUT が来ても復旧しない）', async () => {
    vi.useFakeTimers()
    try {
      m.signOut.mockImplementation(() => new Promise(() => {}))
      const r = makeRefs()
      const actions = createAuthActions({ userRef: r.userRef, broadcastChannelRef: r.broadcastChannelRef, isExplicitSignOutRef: r.isExplicitSignOutRef, setUser: r.setUser, setStaffCache: r.setStaffCache, setLoading: r.setLoading })
      const p = actions.signOutForRelogin(3000)
      await vi.advanceTimersByTimeAsync(3000)
      expect(await p).toBe('timeout')
      expect(r.isExplicitSignOutRef.current).toBe(true)
    } finally { vi.useRealTimers() }
  })

  it('成功したら利用者情報を消し、他のタブに知らせる', async () => {
    m.signOut.mockResolvedValue({ error: null })
    const r = makeRefs()
    const post = vi.fn()
    const actions = createAuthActions({ userRef: r.userRef, broadcastChannelRef: { current: { postMessage: post } as never }, isExplicitSignOutRef: r.isExplicitSignOutRef, setUser: r.setUser, setStaffCache: r.setStaffCache, setLoading: r.setLoading })
    expect(await actions.signOutForRelogin()).toBe('ok')
    expect(r.setUser).toHaveBeenCalledWith(null)
    expect(r.userRef.current).toBeNull()
    expect(post).toHaveBeenCalledWith({ type: 'SIGNED_OUT' })
  })
})

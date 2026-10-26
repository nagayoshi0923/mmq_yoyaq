// @vitest-environment jsdom
/**
 * ログイン直後（SIGNED_IN）の戻り先の扱い（QW-20261023-001）。
 *
 * - Google などで外へ出て戻ったとき、Supabase が許可外の戻り先を MMQ トップ（サイトの URL）に置き換えることがある。
 *   トップ（/）に着いたら、タブ内に覚えた戻り先（作品の貸切タブ）へ送り直す。
 *   以前は「戻り先が今のパスで始まるなら送らない」判定だったため、/ ではどの戻り先も送られずトップに残った。
 * - メール＋パスワードはログイン画面（LoginForm）が行き先を決める。見張り側が同じ戻り先を読んで消すと
 *   ログイン画面が戻り先を見失うので、ログイン画面・登録画面にいる間は触らない。
 */
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

type AuthCallback = (event: string, session: unknown) => Promise<void> | void
const listeners: AuthCallback[] = []

vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      onAuthStateChange: (cb: AuthCallback) => {
        listeners.push(cb)
        return { data: { subscription: { unsubscribe: () => undefined } } }
      },
    },
  },
}))
vi.mock('@/lib/api/authSessionApi', () => ({
  authSessionApi: { listCustomerIdsByUserId: vi.fn(async () => ({ data: [{ id: 'c1' }] })) },
}))
vi.mock('./resolveUserFromSession', () => ({ resolveUserFromSession: vi.fn(async () => undefined) }))
vi.mock('./authDiagnostics', () => ({ reportAuthFailure: vi.fn() }))

const navigations: string[] = []
vi.mock('@/lib/authReturn', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/authReturn')>()
  return { ...actual, goToReturnUrl: (url: string) => { navigations.push(url) } }
})

import { useAuthLifecycle } from './useAuthLifecycle'

const RETURN_TO = '/queens-waltz/scenario/usagi?tab=private'

function Harness() {
  useAuthLifecycle({
    loading: false,
    resolveDeps: {} as never,
    getInitialSession: async () => undefined,
    tryRecoverSession: async () => false,
    refreshSession: async () => undefined,
    userRef: { current: null },
    isProcessingRef: { current: false },
    isExplicitSignOutRef: { current: false },
    recoveryAttemptedRef: { current: false },
    broadcastChannelRef: { current: null },
    setUser: () => undefined,
    setStaffCache: () => undefined,
    setLoading: () => undefined,
    setIsInitialized: () => undefined,
  })
  return null
}

let root: Root | null = null
let host: HTMLDivElement | null = null
let jsdomNavigation: ReturnType<typeof vi.spyOn>

async function signedInAt(path: string) {
  window.history.replaceState(null, '', path)
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
  act(() => { root!.render(<Harness />) })
  await act(async () => {
    await listeners[listeners.length - 1]('SIGNED_IN', { user: { id: 'u1', app_metadata: { provider: 'email' } } })
    await new Promise(r => setTimeout(r, 0))
  })
}

/** 見張りが送ろうとした行き先（修正後は goToReturnUrl、修正前は location.href の書き換え＝jsdom の未実装エラー） */
function attemptedNavigation(): boolean {
  return navigations.length > 0
    || jsdomNavigation.mock.calls.some((args: unknown[]) => String((args[0] as { message?: string } | undefined)?.message ?? args[0] ?? '').includes('navigation'))
}

beforeEach(() => {
  listeners.length = 0
  navigations.length = 0
  sessionStorage.clear()
  jsdomNavigation = vi.spyOn(console, 'error').mockImplementation(() => undefined)
})

afterEach(() => {
  act(() => root?.unmount())
  host?.remove()
  root = null
  host = null
  jsdomNavigation.mockRestore()
  window.history.replaceState(null, '', '/')
})

describe('ログイン直後の戻り先（認証の見張り）', () => {
  it('MMQ トップ（/）に着いたら、覚えていた作品の貸切タブへ送る', async () => {
    sessionStorage.setItem('returnUrl', RETURN_TO)
    await signedInAt('/')
    expect(attemptedNavigation()).toBe(true)
    if (navigations.length) expect(navigations).toEqual([RETURN_TO])
    expect(sessionStorage.getItem('returnUrl')).toBeNull()
  })

  it('組織トップ（/queens-waltz）に着いたときも作品の貸切タブへ送る', async () => {
    sessionStorage.setItem('returnUrl', RETURN_TO)
    await signedInAt('/queens-waltz')
    expect(attemptedNavigation()).toBe(true)
  })

  it('パス・クエリまで同じ作品ページに戻っているときは送り直さない（二重の読み込みをしない）', async () => {
    sessionStorage.setItem('returnUrl', RETURN_TO)
    await signedInAt(RETURN_TO)
    expect(attemptedNavigation()).toBe(false)
    expect(sessionStorage.getItem('returnUrl')).toBeNull()
  })

  it('Google・メールのリンクで同じ作品のパスにクエリなしで戻ったら、貸切タブと店舗のクエリを戻す', async () => {
    const withStores = '/queens-waltz/scenario/usagi?tab=private&stores=s1%2Cs2'
    sessionStorage.setItem('returnUrl', withStores)
    await signedInAt('/queens-waltz/scenario/usagi')
    expect(attemptedNavigation()).toBe(true)
    if (navigations.length) expect(navigations).toEqual([withStores])
    expect(sessionStorage.getItem('returnUrl')).toBeNull()
  })

  it('覚えていた戻り先が別の作品なら、その作品の貸切タブへ送る', async () => {
    sessionStorage.setItem('returnUrl', RETURN_TO)
    await signedInAt('/queens-waltz/scenario/other')
    expect(attemptedNavigation()).toBe(true)
    if (navigations.length) expect(navigations).toEqual([RETURN_TO])
  })

  it('ログイン画面にいる間は戻り先に触らない（ログイン画面が行き先を決める）', async () => {
    sessionStorage.setItem('returnUrl', RETURN_TO)
    await signedInAt(`/login?redirect=${encodeURIComponent(RETURN_TO)}`)
    expect(attemptedNavigation()).toBe(false)
    expect(sessionStorage.getItem('returnUrl')).toBe(RETURN_TO)
  })

  it('組織付きのログイン画面（/queens-waltz/login）でも触らない', async () => {
    sessionStorage.setItem('returnUrl', RETURN_TO)
    await signedInAt(`/queens-waltz/login?redirect=${encodeURIComponent(RETURN_TO)}`)
    expect(attemptedNavigation()).toBe(false)
    expect(sessionStorage.getItem('returnUrl')).toBe(RETURN_TO)
  })

  it('外部サイトの戻り先は使わない', async () => {
    sessionStorage.setItem('returnUrl', '/\\evil.example')
    await signedInAt('/')
    expect(attemptedNavigation()).toBe(false)
    expect(sessionStorage.getItem('returnUrl')).toBeNull()
  })
})

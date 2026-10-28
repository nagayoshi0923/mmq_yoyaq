// @vitest-environment jsdom
import { act } from 'react'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const m = vi.hoisted(() => ({ backup: null as string | null, getSession: vi.fn(), refresh: vi.fn(), setSession: vi.fn(), role: vi.fn(), staff: vi.fn(), customer: vi.fn(), navigate: vi.fn(), profile: vi.fn(), signOut: vi.fn(), signIn: vi.fn(), callback: null as null | ((event: string, session: unknown) => unknown) }))
vi.mock('@/lib/supabase', () => ({ get sessionBackupJson() { return m.backup }, supabase: { auth: {
  getSession: m.getSession, refreshSession: m.refresh, setSession: m.setSession, signOut: m.signOut, signInWithPassword: m.signIn,
  onAuthStateChange: (cb: typeof m.callback) => { m.callback = cb; return { data: { subscription: { unsubscribe: vi.fn() } } } },
} } }))
vi.mock('@/hooks/usePageMeta', () => ({ usePageMeta: vi.fn() }))
vi.mock('@/lib/authResendSignup', () => ({ resendSignupConfirmationEmail: vi.fn() }))
vi.mock('@/lib/api/organizationReadApi', () => ({ loginProfileReadApi: { findUserProfile: m.profile, findStaffWithOrganizationSlug: vi.fn(async () => ({ data: null, error: null })) }, organizationReadApi: {} }))
vi.mock('@/lib/sentry', () => ({ setUser: vi.fn() }))
vi.mock('@/lib/webPush', () => ({ removeWebPushSubscription: vi.fn() }))
vi.mock('@/lib/persistedQueryCache', () => ({ clearPersistedQueryCache: vi.fn() }))
vi.mock('./useStrandedAuthTokenRecovery', () => ({ useStrandedAuthTokenRecovery: vi.fn() }))
vi.mock('./authContextHelpers', async (original) => ({ ...await original<typeof import('./authContextHelpers')>(), logAuthEvent: vi.fn(), navigateAfterAuth: m.navigate }))
vi.mock('./authDiagnostics', () => ({ reportAuthFailure: vi.fn() }))
vi.mock('@/lib/api/authSessionApi', () => ({ authSessionApi: {
  getUserRole: m.role, findStaffIdByUserId: m.staff, findStaffIdByEmail: m.staff,
  findCustomerNameByUserId: vi.fn(async () => ({ data: null })), findUnlinkedCustomerByEmail: vi.fn(async () => ({ data: null })),
  findStaffNameByUserId: vi.fn(async () => ({ data: { name: '架空' } })), listCustomerIdsByUserId: m.customer,
} }))
import { captureOAuthCallbackIntent, forgetReturnUrl } from '@/lib/authReturn'
import { LoginForm } from '@/components/auth/LoginForm'
import { setLoginCompletionPending } from '@/components/auth/loginCompletion'
import { AuthProvider, useAuth } from '../AuthContext'
import { useAuthLifecycle, type AuthLifecycleDeps } from './useAuthLifecycle'

const U = { id: 'fake-u', email: 'qa@example.invalid', user_metadata: {}, app_metadata: { provider: 'google' } }
const S = { user: U, expires_at: 4_000_000_000 }
let controls: ReturnType<typeof useAuth>
let root: Root, host: HTMLDivElement
function Probe() { const auth = useAuth(); controls = auth; return <output data-user={auth.user?.id}>{auth.isInitialized ? `ready:${auth.user?.role ?? 'none'}` : 'pending'}</output> }
async function render() { await act(async () => root.render(<AuthProvider><Probe /></AuthProvider>)) }
async function tick(ms = 1) { await act(async () => vi.advanceTimersByTimeAsync(ms)) }
beforeEach(() => {
  vi.useFakeTimers(); vi.clearAllMocks(); m.callback = null; m.backup = null
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  forgetReturnUrl()
  setLoginCompletionPending(false)
  sessionStorage.clear(); window.history.replaceState({}, '', '/queens-waltz/scenario/fake?event=e1&count=2')
  m.getSession.mockResolvedValue({ data: { session: S }, error: null })
  m.role.mockResolvedValue({ data: null, error: { message: 'offline' } })
  m.staff.mockResolvedValue({ data: null, error: null })
  m.refresh.mockResolvedValue({ data: { session: null }, error: null })
  m.customer.mockResolvedValue({ data: [{ id: 'c1' }], error: null })
  m.signOut.mockResolvedValue({ error: null })
  host = document.createElement('div'); document.body.append(host); root = createRoot(host)
})
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.useRealTimers() })

describe('認証方式によらない情報取得失敗と回復', () => {
  it('保存sessionのrole未確定を警告し、再認証なしの再試行で本来のroleへ回復する', async () => {
    await render()
    expect(host.querySelector('[role="alert"]')).not.toBeNull()
    expect(host.textContent).toContain('ready:none')
    const link = host.querySelector('a')!
    expect(link.getAttribute('href')).toBe('/login?redirect=%2Fqueens-waltz%2Fscenario%2Ffake%3Fevent%3De1%26count%3D2')
    m.role.mockResolvedValue({ data: { role: 'admin' }, error: null })
    await act(async () => (host.querySelector('button') as HTMLButtonElement).click())
    expect(host.querySelector('[role="alert"]')).toBeNull()
    expect(host.textContent).toContain('ready:admin')
    expect(m.signIn).not.toHaveBeenCalled(); expect(m.signOut).not.toHaveBeenCalled()
  })
  it('OAuth未確定ではreturnUrlを消費せず、顧客登録判定へ進まず警告する', async () => {
    m.getSession.mockResolvedValue({ data: { session: null }, error: null })
    await render()
    sessionStorage.setItem('oauth_mode', 'login'); sessionStorage.setItem('returnUrl', '/queens-waltz/scenario/fake?event=e1')
    const result = m.callback!('SIGNED_IN', S)
    expect(result).toBeUndefined() // SDKのロックを保持するPromiseを返さない
    await tick()
    expect(host.querySelector('[role="alert"]')).not.toBeNull()
    expect(sessionStorage.getItem('returnUrl')).toContain('event=e1')
    expect(m.customer).not.toHaveBeenCalled()
  })
  it('OAuthの共通再試行が顧客確認と予約returnToまで再開する', async () => {
    m.getSession.mockResolvedValue({ data: { session: null }, error: null })
    await render()
    sessionStorage.setItem('oauth_mode', 'login'); sessionStorage.setItem('returnUrl', '/queens-waltz/scenario/fake?event=e2&count=2')
    m.callback!('SIGNED_IN', S); await tick()
    expect(host.querySelector('[role="alert"]')).not.toBeNull()
    m.role.mockResolvedValue({ data: { role: 'customer' }, error: null })
    await act(async () => (host.querySelector('button') as HTMLButtonElement).click())
    expect(m.customer).toHaveBeenCalledWith(U.id)
    expect(m.navigate).toHaveBeenCalledWith('/queens-waltz/scenario/fake?event=e2&count=2')
    expect(sessionStorage.getItem('returnUrl')).toBeNull()
    expect(controls.authRecoveryPending).toBe(true) // 移動先の描画まで自動転送を抑止
    expect(m.signIn).not.toHaveBeenCalled(); expect(m.signOut).not.toHaveBeenCalled()
  })
  it.each([['INITIAL_SESSION'], ['SIGNED_IN', 'INITIAL_SESSION']])('OAuth初期イベント%jでも再試行後に顧客確認と復帰を完了する', async (...events) => {
    m.getSession.mockResolvedValue({ data: { session: null }, error: null })
    await render()
    sessionStorage.setItem('oauth_mode', 'login'); sessionStorage.setItem('returnUrl', '/faq?from=oauth')
    for (const event of events) m.callback!(event, S)
    await tick()
    expect(host.querySelector('[role="alert"]')).not.toBeNull()
    m.role.mockResolvedValue({ data: { role: 'customer' }, error: null })
    await act(async () => (host.querySelector('button') as HTMLButtonElement).click())
    expect(m.customer).toHaveBeenCalledWith(U.id)
    expect(m.navigate).toHaveBeenCalledWith('/faq?from=oauth')
    expect(sessionStorage.getItem('oauth_mode')).toBeNull()
  })
  it('/login#へ戻ったOAuthも実フォームが戻り先を消さず、共通再試行から顧客確認して復帰する', async () => {
    m.getSession.mockResolvedValue({ data: { session: null }, error: null })
    sessionStorage.setItem('oauth_mode', 'login'); sessionStorage.setItem('returnUrl', '/faq?from=callback')
    window.history.replaceState({}, '', '/login#access_token=fixture&refresh_token=fixture')
    captureOAuthCallbackIntent() // 実clientではcreateClientより前に行う
    window.history.replaceState({}, '', '/login#') // SDKが消去した後にLoginFormがmount
    await act(async () => root.render(<AuthProvider><MemoryRouter initialEntries={['/login']}><LoginForm /></MemoryRouter></AuthProvider>))
    expect(sessionStorage.getItem('returnUrl')).toBe('/faq?from=callback')
    m.callback!('SIGNED_IN', S); m.callback!('INITIAL_SESSION', S); await tick()
    const notice = host.querySelector('[role="alert"]')!
    expect(notice).not.toBeNull()
    expect(notice.querySelector('a')?.getAttribute('href')).toBe('/login?redirect=%2Ffaq%3Ffrom%3Dcallback')
    m.role.mockResolvedValue({ data: { role: 'customer' }, error: null })
    await act(async () => (notice.querySelector('button') as HTMLButtonElement).click())
    expect(m.customer).toHaveBeenCalledWith(U.id)
    expect(m.navigate).toHaveBeenCalledWith('/faq?from=callback')
    expect(m.signIn).not.toHaveBeenCalled(); expect(m.signOut).not.toHaveBeenCalled()
  })
  it('SDK通知が顧客確認の途中に重なっても確認と遷移を1回だけ行う', async () => {
    m.getSession.mockResolvedValue({ data: { session: null }, error: null })
    m.role.mockResolvedValue({ data: { role: 'customer' }, error: null })
    let finish!: (value: unknown) => void
    m.customer.mockImplementation(() => new Promise(resolve => { finish = resolve }))
    await render()
    sessionStorage.setItem('oauth_mode', 'login'); sessionStorage.setItem('returnUrl', '/faq?from=overlap')
    m.callback!('SIGNED_IN', S); await tick()
    m.callback!('INITIAL_SESSION', S); await tick()
    expect(m.customer).toHaveBeenCalledOnce()
    await act(async () => finish({ data: [{ id: 'fake-customer' }], error: null }))
    expect(m.navigate).toHaveBeenCalledOnce()
    expect(m.navigate).toHaveBeenCalledWith('/faq?from=overlap')
    expect(controls.authRecoveryPending).toBe(true) // 移動完了までは先行転送しない
  })
  it('OAuth顧客照合エラーを未登録とせず、再試行で取得成功後だけプロフィールへ案内する', async () => {
    m.getSession.mockResolvedValue({ data: { session: null }, error: null })
    m.role.mockResolvedValue({ data: { role: 'customer' }, error: null })
    m.customer.mockResolvedValue({ data: null, error: { message: 'fixture offline' } })
    await render()
    sessionStorage.setItem('oauth_mode', 'login'); sessionStorage.setItem('returnUrl', '/faq?from=booking')
    m.callback!('SIGNED_IN', S); await tick()
    expect(host.querySelector('[role="alert"]')).not.toBeNull()
    expect(controls.authRecoveryPending).toBe(true)
    expect(m.navigate).not.toHaveBeenCalled()
    m.customer.mockResolvedValue({ data: [], error: null })
    await act(async () => (host.querySelector('button') as HTMLButtonElement).click())
    expect(m.navigate).toHaveBeenCalledWith('/complete-profile?next=%2Ffaq%3Ffrom%3Dbooking')
    expect(controls.authRecoveryPending).toBe(true) // 移動先の描画まで自動転送を抑止
  })
  it('SDK getSessionが無応答でも10秒で警告し、ロックを破壊せず再試行できる', async () => {
    m.getSession.mockImplementation(() => new Promise(() => {}))
    await render(); await tick(10_001)
    expect(host.querySelector('[role="alert"]')).not.toBeNull()
    expect(host.textContent).toContain('ready:none')
    m.getSession.mockResolvedValue({ data: { session: S }, error: null })
    m.role.mockResolvedValue({ data: { role: 'staff' }, error: null })
    await act(async () => (host.querySelector('button') as HTMLButtonElement).click())
    expect(host.textContent).toContain('ready:staff')
    expect(m.signOut).not.toHaveBeenCalled()
  })
  it.each([null, { name: 'AuthSessionMissingError', message: 'Auth session missing' }])('timeout後の再試行で正常な未ログインを確認したら警告を解除する: %j', async (error) => {
    m.getSession.mockImplementation(() => new Promise(() => {}))
    await render(); await tick(10_001)
    expect(host.querySelector('[role="alert"]')).not.toBeNull()
    m.getSession.mockResolvedValue({ data: { session: null }, error: null })
    m.refresh.mockResolvedValue({ data: { session: null }, error })
    await act(async () => (host.querySelector('button') as HTMLButtonElement).click())
    expect(host.querySelector('[role="alert"]')).toBeNull()
    expect(host.textContent).toContain('ready:none')
    expect(m.signOut).not.toHaveBeenCalled()
  })
  it.each(['network', 'backup', 'role'])('再試行の%s失敗は正常な未ログインとして警告を消さない', async (failure) => {
    m.getSession.mockImplementation(() => new Promise(() => {}))
    await render(); await tick(10_001)
    m.getSession.mockResolvedValue({ data: { session: failure === 'role' ? S : null }, error: null })
    if (failure === 'network') m.refresh.mockRejectedValue(new Error('fixture offline'))
    if (failure === 'backup') {
      m.backup = JSON.stringify({ access_token: 'fixture', refresh_token: 'fixture' })
      m.setSession.mockResolvedValue({ data: { session: null }, error: { message: 'fixture offline' } })
    }
    await act(async () => (host.querySelector('button') as HTMLButtonElement).click())
    expect(host.querySelector('[role="alert"]')).not.toBeNull()
    expect(m.signOut).not.toHaveBeenCalled()
  })
  it('利用者Aの応答が利用者Bへの切替後に到着してもAへ戻らない', async () => {
    let finish!: (value: unknown) => void
    m.role.mockImplementation((id: string) => id === 'fake-u' ? new Promise(resolve => { finish = resolve }) : Promise.resolve({ data: { role: 'staff' }, error: null }))
    await render()
    m.callback!('SIGNED_IN', { ...S, user: { ...U, id: 'fake-b' } })
    await tick()
    expect(host.querySelector('output')?.getAttribute('data-user')).toBe('fake-b')
    await act(async () => finish({ data: { role: 'admin' }, error: null }))
    expect(host.querySelector('output')?.getAttribute('data-user')).toBe('fake-b')
    expect(host.textContent).toContain('ready:staff')
    expect(host.querySelector('[role="alert"]')).toBeNull()
  })
  it('明示ログアウト後のAの遅い応答で再ログイン状態に戻らない', async () => {
    let finish!: (value: unknown) => void
    m.role.mockImplementation(() => new Promise(resolve => { finish = resolve }))
    await render()
    await act(async () => controls.signOut())
    await act(async () => finish({ data: { role: 'admin' }, error: null }))
    expect(host.querySelector('output')?.getAttribute('data-user')).toBeNull()
    expect(host.querySelector('[role="alert"]')).toBeNull()
  })
  it('SDK session取得の遅い応答もSIGNED_OUT後に利用者を復元しない', async () => {
    let finish!: (value: unknown) => void
    m.getSession.mockImplementation(() => new Promise(resolve => { finish = resolve }))
    m.role.mockResolvedValue({ data: { role: 'admin' }, error: null })
    await render()
    m.callback!('SIGNED_OUT', null); await tick()
    await act(async () => finish({ data: { session: S }, error: null }))
    expect(host.querySelector('output')?.getAttribute('data-user')).toBeNull()
    expect(m.role).not.toHaveBeenCalled()
    await tick(10_001)
    expect(host.querySelector('[role="alert"]')).toBeNull()
  })
  it('古いOAuthの顧客確認が失敗してもBの警告状態や戻り先を変えない', async () => {
    m.getSession.mockResolvedValue({ data: { session: null }, error: null })
    m.role.mockResolvedValue({ data: { role: 'customer' }, error: null })
    let finish!: (value: unknown) => void
    m.customer.mockImplementation(() => new Promise(resolve => { finish = resolve }))
    await render()
    sessionStorage.setItem('oauth_mode', 'login'); sessionStorage.setItem('returnUrl', '/queens-waltz/scenario/fake?event=e1')
    m.callback!('SIGNED_IN', S); await tick()
    m.role.mockResolvedValue({ data: null, error: { message: 'offline' } })
    m.callback!('SIGNED_IN', { ...S, user: { ...U, id: 'fake-b' } }); await tick()
    expect(host.querySelector('[role="alert"]')).not.toBeNull()
    await act(async () => finish({ data: null, error: { message: 'offline' } }))
    expect(host.querySelector('[role="alert"]')).not.toBeNull()
    expect(sessionStorage.getItem('returnUrl')).toContain('event=e1')
  })
  it('passwordの失敗はフォームの再読込へ一本化し、実Providerとフォームの再試行でreturnToへ完了する', async () => {
    m.getSession.mockResolvedValue({ data: { session: null }, error: null })
    m.signIn.mockResolvedValue({ data: { user: { ...U, email_confirmed_at: '2026-01-01' } }, error: null })
    m.profile.mockResolvedValue({ data: null, error: { message: 'fixture failure' } })
    window.history.replaceState({}, '', '/login?redirect=%2Ffaq%3Ffrom%3Dbooking')
    function Form() { const location = useLocation(); return <><LoginForm /><output data-path={location.pathname + location.search} /></> }
    await act(async () => root.render(<AuthProvider><MemoryRouter initialEntries={['/login?redirect=%2Ffaq%3Ffrom%3Dbooking']}><Form /></MemoryRouter></AuthProvider>))
    const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
    const fields = host.querySelectorAll('input')
    await act(async () => {
      set.call(fields[0], 'qa@example.invalid'); fields[0].dispatchEvent(new Event('input', { bubbles: true }))
      set.call(fields[1], 'fixture-password'); fields[1].dispatchEvent(new Event('input', { bubbles: true }))
    })
    await act(async () => host.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })))
    await tick()
    expect(host.textContent).toContain('利用者情報を読み込めませんでした')
    expect(host.querySelector('[aria-label="ログイン情報の確認エラー"]')).toBeNull()
    expect(host.querySelector('[data-testid="login-profile-retry"]')).not.toBeNull()
    m.role.mockResolvedValue({ data: { role: 'customer' }, error: null })
    m.profile.mockResolvedValue({ data: { role: 'customer', organization_id: null }, error: null })
    await act(async () => (host.querySelector('[data-testid="login-profile-retry"]') as HTMLButtonElement).click())
    await tick()
    expect(host.querySelector('output')?.getAttribute('data-path')).toBe('/faq?from=booking')
    expect(m.signIn).toHaveBeenCalledOnce()
    expect(m.signOut).not.toHaveBeenCalled()
  })
  it('roleがnullでもcustomerへ推測せず警告する', async () => {
    m.role.mockResolvedValue({ data: null, error: null })
    await render()
    expect(host.querySelector('[role="alert"]')).not.toBeNull()
    expect(host.textContent).toContain('ready:none')
  })
})

it('SIGNED_OUT復旧はSDK callback解放後に開始し、再入ロックの待合せを作らない', async () => {
  const recover = vi.fn(async () => true)
  const d = {
    loading: false, resolveDeps: {}, getInitialSession: vi.fn(async () => {}), tryRecoverSession: recover,
    refreshSession: vi.fn(async () => {}), userRef: { current: { id: 'fake-u', role: 'admin' } },
    isProcessingRef: { current: false }, isExplicitSignOutRef: { current: false }, recoveryAttemptedRef: { current: false }, broadcastChannelRef: { current: null },
    setUser: vi.fn(), setStaffCache: vi.fn(), setLoading: vi.fn(), setIsInitialized: vi.fn(),
  } as unknown as AuthLifecycleDeps
  function Lifecycle() { useAuthLifecycle(d); return null }
  await act(async () => root.render(<Lifecycle />))
  expect(m.callback!('SIGNED_OUT', null)).toBeUndefined()
  expect(recover).not.toHaveBeenCalled()
  await tick()
  expect(recover).toHaveBeenCalledOnce()
  expect(d.setUser).not.toHaveBeenCalledWith(null)
})

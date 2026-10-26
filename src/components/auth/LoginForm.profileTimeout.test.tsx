// @vitest-environment jsdom
// 2026-10-26 本番ログイン障害: ログイン成功のあとの利用者情報の読み取りが止まると「ログイン成功！リダイレクト中...」のまま進まなかった
// （調査担当の再現: users・組織・staff の各読み取りが無応答で 60 秒後も /login）。認証の成功と利用者情報の確定を分け、
// 期限つき・失敗はセッションを残して再読み込み（パスワードのログインはやり直さない）。役割・所属は決め打ちしない。
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ signIn: vi.fn(), signOut: vi.fn(), reloadUser: vi.fn(), profile: vi.fn(), org: vi.fn(), staff: vi.fn(), staffOnly: vi.fn() }))
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ signIn: mocks.signIn, signOut: mocks.signOut, reloadUser: mocks.reloadUser, loading: false }) }))
vi.mock('@/hooks/usePageMeta', () => ({ usePageMeta: () => {} }))
vi.mock('@/lib/supabase', () => ({ supabase: { auth: {} } }))
vi.mock('@/lib/api/organizationReadApi', () => ({
  loginProfileReadApi: { findUserProfile: mocks.profile, findStaffWithOrganizationSlug: mocks.staff, findStaffOnly: mocks.staffOnly },
  organizationReadApi: { findSlugById: mocks.org },
}))
vi.mock('@/lib/authResendSignup', () => ({ resendSignupConfirmationEmail: vi.fn() }))
vi.mock('@/contexts/auth/authDiagnostics', () => ({ reportAuthFailure: vi.fn() }))
import { LoginForm } from './LoginForm'

const USER = { id: 'fake-user', email: 'qa@example.invalid', email_confirmed_at: '2026-01-01' }
const never = () => new Promise(() => {})
let root: Root, host: HTMLDivElement
const paths: string[] = []
function Probe() { const p = useLocation().pathname; if (paths.at(-1) !== p) paths.push(p); return <LoginForm /> }
const path = () => paths.at(-1)
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  vi.useFakeTimers()
  sessionStorage.clear(); paths.length = 0
  mocks.signIn.mockReset().mockResolvedValue({ user: USER })
  mocks.signOut.mockReset()
  mocks.reloadUser.mockReset().mockResolvedValue({ id: USER.id, role: 'admin' })
  mocks.profile.mockReset().mockResolvedValue({ data: { role: 'admin', organization_id: 'fake-org', is_store_representative: false }, error: null })
  mocks.org.mockReset().mockResolvedValue({ data: { slug: 'fake-org' }, error: null })
  mocks.staff.mockReset().mockResolvedValue({ data: null, error: null })
  mocks.staffOnly.mockReset().mockResolvedValue({ data: null, error: null })
  host = document.createElement('div'); document.body.append(host); root = createRoot(host)
})
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.useRealTimers() })
const submitButton = () => host.querySelector('button[type="submit"]') as HTMLButtonElement
const retryButton = () => host.querySelector('[data-testid="login-profile-retry"]') as HTMLButtonElement | null
async function render() { await act(async () => root.render(<MemoryRouter initialEntries={['/login']}><Probe /></MemoryRouter>)) }
async function submit() {
  const inputs = host.querySelectorAll('input')
  const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
  await act(async () => {
    set.call(inputs[0], 'qa@example.invalid'); inputs[0].dispatchEvent(new Event('input', { bubbles: true }))
    set.call(inputs[1], 'fake-pass-123'); inputs[1].dispatchEvent(new Event('input', { bubbles: true }))
  })
  await act(async () => host.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })))
  await act(async () => vi.advanceTimersByTimeAsync(1))
}

describe('ログインのあとの利用者情報の読み取り', () => {
  it('すべて応答すれば従来どおり所属組織のスケジュールへ', async () => {
    await render(); await submit()
    expect(path()).toBe('/fake-org/schedule')
    expect(mocks.reloadUser).toHaveBeenCalledWith(USER)
  })

  it.each(['profile', 'org', 'staff', 'reloadUser'] as const)('%s が無応答でも止まらず、期限（10 秒）で「ログインは完了」と再読み込みを出す。遷移しない・ログインはやり直さない', async (stage) => {
    mocks[stage].mockImplementation(never)
    await render(); await submit()
    expect(submitButton().disabled).toBe(true) // 読み取り中は送信できない
    await act(async () => vi.advanceTimersByTimeAsync(10_000))
    expect(path()).toBe('/login')
    expect(host.textContent).toContain('ログインは完了しています')
    expect(host.textContent).not.toContain('リダイレクト中')
    expect(retryButton()).not.toBeNull()
    expect(mocks.signIn).toHaveBeenCalledOnce()
    expect(mocks.signOut).not.toHaveBeenCalled()
  })

  it('再読み込みは利用者情報だけ読み直し（パスワードのログイン・ログアウトはしない）、読めたら本来の行き先へ', async () => {
    mocks.profile.mockImplementationOnce(never)
    await render(); await submit()
    await act(async () => vi.advanceTimersByTimeAsync(10_000))
    await act(async () => retryButton()!.click())
    await act(async () => vi.advanceTimersByTimeAsync(1))
    expect(path()).toBe('/fake-org/schedule')
    expect(mocks.signIn).toHaveBeenCalledOnce()
    expect(mocks.signOut).not.toHaveBeenCalled()
    expect(mocks.profile).toHaveBeenCalledTimes(2)
  })

  it('読み取りが失敗（エラー）したら、お客様などに決め打ちして遷移せず、再読み込みを出す', async () => {
    mocks.profile.mockResolvedValueOnce({ data: null, error: { message: 'boom' } })
    await render(); await submit()
    expect(path()).toBe('/login')
    expect(host.textContent).toContain('利用者情報を読み込めませんでした')
    expect(retryButton()).not.toBeNull()
  })

  it('アプリ全体の役割が確定しない（reloadUser が null）なら遷移しない', async () => {
    mocks.reloadUser.mockResolvedValueOnce(null)
    await render(); await submit()
    expect(path()).toBe('/login')
    expect(retryButton()).not.toBeNull()
  })

  it('戻り先（returnUrl）は失敗しても消さず、再読み込みで確定したら戻り先へ', async () => {
    // 戻り先は URL の ?redirect= が正（開いたときにタブ内へ写す）
    window.history.replaceState({}, '', '/login?redirect=' + encodeURIComponent('/queens-waltz/scenario/kaku?event=ev1'))
    mocks.profile.mockResolvedValue({ data: { role: 'customer', organization_id: null, is_store_representative: false }, error: null })
    mocks.staff.mockImplementationOnce(never)
    await render(); await submit()
    await act(async () => vi.advanceTimersByTimeAsync(10_000))
    expect(sessionStorage.getItem('returnUrl')).toBe('/queens-waltz/scenario/kaku?event=ev1')
    await act(async () => retryButton()!.click())
    await act(async () => vi.advanceTimersByTimeAsync(1))
    expect(path()).toBe('/queens-waltz/scenario/kaku')
    expect(sessionStorage.getItem('returnUrl')).toBeNull()
    window.history.replaceState({}, '', '/')
  })

  it('期限切れの試行の結果が遅れて届いても、再読み込みの結果と二重に遷移しない', async () => {
    let late!: (v: unknown) => void
    mocks.profile.mockImplementationOnce(() => new Promise((r) => { late = r }))
    await render(); await submit()
    await act(async () => vi.advanceTimersByTimeAsync(10_000))
    await act(async () => retryButton()!.click())
    await act(async () => vi.advanceTimersByTimeAsync(1))
    expect(path()).toBe('/fake-org/schedule')
    // 1 回目（期限切れ）の応答が遅れて届く（別の所属だったとしても使わない）
    mocks.org.mockResolvedValue({ data: { slug: 'other-org' }, error: null })
    await act(async () => { late({ data: { role: 'admin', organization_id: 'other', is_store_representative: false }, error: null }); await vi.advanceTimersByTimeAsync(1) })
    expect(paths).toEqual(['/login', '/fake-org/schedule'])
  })

  it('読み取り中に画面を離れたら、あとで応答が届いても遷移しない', async () => {
    let late!: (v: unknown) => void
    mocks.profile.mockImplementationOnce(() => new Promise((r) => { late = r }))
    await render(); await submit()
    await act(async () => root.unmount())
    await act(async () => { late({ data: { role: 'admin', organization_id: 'fake-org', is_store_representative: false }, error: null }); await vi.advanceTimersByTimeAsync(10_000) })
    expect(paths).toEqual(['/login'])
    root = createRoot(host)
  })

  it('同じ瞬間の二度押しでも、ログインは 1 回だけ', async () => {
    await render()
    const inputs = host.querySelectorAll('input')
    const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
    await act(async () => {
      set.call(inputs[0], 'qa@example.invalid'); inputs[0].dispatchEvent(new Event('input', { bubbles: true }))
      set.call(inputs[1], 'fake-pass-123'); inputs[1].dispatchEvent(new Event('input', { bubbles: true }))
    })
    const form = host.querySelector('form')!
    await act(async () => { form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })) })
    await act(async () => vi.advanceTimersByTimeAsync(1))
    expect(mocks.signIn).toHaveBeenCalledOnce()
    expect(paths).toEqual(['/login', '/fake-org/schedule'])
  })

  it('ログイン済みで利用者情報だけ読めなかったあとにログインボタンを押しても、パスワードのログインはやり直さず利用者情報だけ読み直す', async () => {
    mocks.profile.mockImplementationOnce(never)
    await render(); await submit()
    await act(async () => vi.advanceTimersByTimeAsync(10_000))
    await act(async () => host.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })))
    await act(async () => vi.advanceTimersByTimeAsync(1))
    expect(mocks.signIn).toHaveBeenCalledOnce()
    expect(mocks.signOut).not.toHaveBeenCalled()
    expect(path()).toBe('/fake-org/schedule')
  })

  it('ログインの応答を待つ間に画面を離れたら、あとで応答が届いても利用者情報の読み取り・遷移を始めない', async () => {
    let done!: (v: unknown) => void
    mocks.signIn.mockImplementationOnce(() => new Promise((r) => { done = r }))
    await render(); await submit()
    await act(async () => root.unmount())
    await act(async () => { done({ user: USER }); await vi.advanceTimersByTimeAsync(1) })
    expect(mocks.profile).not.toHaveBeenCalled()
    expect(mocks.reloadUser).not.toHaveBeenCalled()
    expect(paths).toEqual(['/login'])
    root = createRoot(host)
  })

  it('読み取り中に送信を重ねても、ログインは 1 回だけ', async () => {
    mocks.profile.mockImplementationOnce(never)
    await render(); await submit()
    await act(async () => host.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })))
    await act(async () => vi.advanceTimersByTimeAsync(1))
    expect(mocks.signIn).toHaveBeenCalledOnce()
  })
})

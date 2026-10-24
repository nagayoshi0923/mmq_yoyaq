// @vitest-environment jsdom
/**
 * 作品ページの「貸切リクエスト」→ ログイン → 元の作品ページへ戻る（QW-20261023-001）。
 *
 * メール＋パスワードのログインでは、ログイン画面（LoginForm）と認証の見張り（useAuthLifecycle の SIGNED_IN）が
 * 同じタブ内の戻り先（sessionStorage の returnUrl）を取り合う。見張りが先に読んで消すと、
 * ログイン画面は戻り先を見失い MMQ トップ（/）や組織トップへ送っていた。
 * URL の ?redirect= を正として持っているので、タブ内の記憶が消えていても元の画面へ戻すこと。
 */
import { act, type ReactNode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'

const RETURN_TO = '/queens-waltz/scenario/usagi?tab=private'

const signIn = vi.fn()
vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ signIn, loading: false }),
}))
vi.mock('@/hooks/usePageMeta', () => ({ usePageMeta: () => undefined }))
vi.mock('@/lib/supabase', () => ({ supabase: { auth: {} } }))
vi.mock('@/contexts/auth/authDiagnostics', () => ({ reportAuthFailure: vi.fn() }))

const profile: { role: string; organization_id: string | null; is_store_representative: boolean } = {
  role: 'customer',
  organization_id: null,
  is_store_representative: false,
}
const orgSlug: { value: string | null } = { value: null }
vi.mock('@/lib/api/organizationReadApi', () => ({
  loginProfileReadApi: {
    findUserProfile: vi.fn(async () => ({ data: { ...profile } })),
    findStaffWithOrganizationSlug: vi.fn(async () => ({ data: null, error: null })),
    findStaffOnly: vi.fn(async () => ({ data: null })),
    checkEmailRegistrationStatus: vi.fn(),
  },
  organizationReadApi: {
    findSlugById: vi.fn(async () => ({ data: orgSlug.value ? { slug: orgSlug.value } : null })),
  },
}))

import { LoginForm } from './LoginForm'

let root: Root | null = null
let host: HTMLDivElement | null = null
const seen: string[] = []

function Probe() {
  const location = useLocation()
  seen.push(`${location.pathname}${location.search}`)
  return <div data-testid="probe">{location.pathname}{location.search}</div>
}

function mount(node: ReactNode) {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
  act(() => { root!.render(node) })
}

function setInput(id: string, value: string) {
  const el = host!.querySelector<HTMLInputElement>(`#${id}`)!
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
  act(() => {
    setter.call(el, value)
    el.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

async function submitLogin() {
  setInput('email', 'qa-customer@example.invalid')
  setInput('password', 'fixture-only')
  const form = host!.querySelector('form')!
  await act(async () => {
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
  })
  // LoginForm は setTimeout(0) の中で行き先を決める
  await act(async () => { await new Promise(r => setTimeout(r, 60)) })
}

function renderLoginAt(url: string) {
  window.history.replaceState(null, '', url)
  mount(
    <MemoryRouter initialEntries={[url]}>
      <Routes>
        <Route path="/login" element={<LoginForm />} />
        <Route path="*" element={<Probe />} />
      </Routes>
    </MemoryRouter>,
  )
}

function landed(): string {
  return host?.querySelector('[data-testid="probe"]')?.textContent ?? '(ログイン画面のまま)'
}

beforeEach(() => {
  seen.length = 0
  sessionStorage.clear()
  profile.organization_id = null
  orgSlug.value = null
  signIn.mockReset()
})

afterEach(() => {
  act(() => root?.unmount())
  host?.remove()
  root = null
  host = null
  window.history.replaceState(null, '', '/')
})

describe('メール＋パスワードでログインした後の戻り先', () => {
  it('認証の見張りが先にタブ内の戻り先を消しても、作品の貸切タブへ戻す（トップへ飛ばさない）', async () => {
    signIn.mockImplementation(async () => {
      // useAuthLifecycle の SIGNED_IN が先に returnUrl を読んで消した状態を再現
      sessionStorage.removeItem('returnUrl')
      return { user: { id: 'u-customer' } }
    })
    renderLoginAt(`/login?redirect=${encodeURIComponent(RETURN_TO)}`)
    await submitLogin()
    expect(landed()).toBe(RETURN_TO)
  })

  it('組織に属するお客様（組織の URL が引けない）でも作品の貸切タブへ戻す', async () => {
    profile.organization_id = 'org-1'
    orgSlug.value = null
    signIn.mockImplementation(async () => {
      sessionStorage.removeItem('returnUrl')
      return { user: { id: 'u-customer' } }
    })
    renderLoginAt(`/login?redirect=${encodeURIComponent(RETURN_TO)}`)
    await submitLogin()
    expect(landed()).toBe(RETURN_TO)
  })

  it('見張りと競合しないときも作品の貸切タブへ戻し、タブ内の戻り先は片付ける', async () => {
    signIn.mockImplementation(async () => ({ user: { id: 'u-customer' } }))
    renderLoginAt(`/login?redirect=${encodeURIComponent(RETURN_TO)}`)
    await submitLogin()
    expect(landed()).toBe(RETURN_TO)
    expect(sessionStorage.getItem('returnUrl')).toBeNull()
  })

  it('外部サイトへの戻り先は使わず、MMQ の中に留める（open redirect 防止）', async () => {
    signIn.mockImplementation(async () => ({ user: { id: 'u-customer' } }))
    for (const evil of ['//evil.example/x', '/\\evil.example', 'https://evil.example', 'javascript:alert(1)', '/\n/evil.example', '/\t/evil.example', '%2F%2Fevil.example']) {
      seen.length = 0
      renderLoginAt(`/login?redirect=${encodeURIComponent(evil)}`)
      await submitLogin()
      expect(landed(), evil).toMatch(/^\//)
      expect(landed()).not.toContain('evil')
      act(() => root?.unmount())
      host?.remove()
      root = null
      host = null
    }
  })

  it('ログインに失敗したらログイン画面に留まり、戻り先は残る（もう一度試せる）', async () => {
    signIn.mockImplementation(async () => { throw new Error('Invalid login credentials') })
    renderLoginAt(`/login?redirect=${encodeURIComponent(RETURN_TO)}`)
    await submitLogin()
    expect(landed()).toBe('(ログイン画面のまま)')
    expect(sessionStorage.getItem('returnUrl')).toBe(RETURN_TO)
    expect(host!.textContent).toContain('メールアドレスまたはパスワードが正しくありません')
  })
})

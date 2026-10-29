// @vitest-environment jsdom
// 2026-10-29 社長承認: ログインはできたが、このメールアドレスのお客様情報が別のログインに結び付いているときの案内。
// 以前は「このメールは既に登録されています」「新規登録フローを続けると…」と出し、ログインした人にも新規登録を選んだように見えていた
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
vi.mock('@/lib/supabase', () => ({ supabase: { auth: {} } }))
import { DuplicateAccountScreen } from './StatusScreens'
import { signOutAndGoHome } from './signOutAndGoHome'

let root: Root, host: HTMLDivElement
beforeEach(() => { Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true }); sessionStorage.clear(); host = document.createElement('div'); document.body.append(host); root = createRoot(host) })
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.useRealTimers() })
const render = (props: Partial<Parameters<typeof DuplicateAccountScreen>[0]> = {}) =>
  act(async () => root.render(<MemoryRouter><DuplicateAccountScreen userEmail="me@example.invalid" {...props} /></MemoryRouter>))
const chooseAgain = () => host.querySelector('[data-testid="duplicate-account-choose-again"]') as HTMLButtonElement

describe('お客様情報がいまのログインに結び付いていないときの案内', () => {
  it('ログインはできていること・連絡先とログインのメールが違う場合があること・選び直しと問い合わせを伝え、新規登録を選んだようには言わない', async () => {
    await render()
    const text = host.textContent ?? ''
    expect(text).toContain('ログインはできています')
    expect(text).toContain('連絡先のメールアドレス')
    expect(text).toContain('ログインに使うアカウントのメールアドレス')
    expect(text).toContain('メールアドレスとパスワード、Google など')
    expect(text).not.toContain('新規登録フロー')
    expect(text).not.toContain('既に登録されています')
    expect(host.querySelector('a[href="/contact"]')).not.toBeNull()
    // 出すメールアドレスは、いまログインしている本人のものだけ
    expect(text.match(/[\w.+-]+@[\w.-]+/g)).toEqual(['me@example.invalid'])
  })

  it('選び直しはログイン情報を消してから、安全な戻り先つきのログイン画面へ。二度押しでも 1 回だけ', async () => {
    const signOutAndGo = vi.fn(() => new Promise<void>(() => {}))
    sessionStorage.setItem('oauth_mode', 'login')
    await render({ returnTo: '/queens-waltz/scenario/kaku?tab=private', signOutAndGo })
    await act(async () => { chooseAgain().click(); chooseAgain().click() })
    expect(signOutAndGo).toHaveBeenCalledTimes(1)
    expect(signOutAndGo).toHaveBeenCalledWith({ to: '/login?redirect=' + encodeURIComponent('/queens-waltz/scenario/kaku?tab=private') })
    expect(chooseAgain().disabled).toBe(true)
    expect(sessionStorage.getItem('oauth_mode')).toBeNull()
  })

  it.each([[null, '/login'], ['https://evil.example/x', '/login'], ['//evil.example', '/login']])('戻り先 %s は安全な内部 URL でなければ付けない（%s）', async (returnTo, to) => {
    const signOutAndGo = vi.fn(async () => {})
    await render({ returnTo, signOutAndGo })
    await act(async () => chooseAgain().click())
    expect(signOutAndGo).toHaveBeenCalledWith({ to })
  })
})

describe('ログアウトしてから移る（signOutAndGoHome の移動先）', () => {
  it('ログアウトが返ってこなくても上限時間で指定の画面へ。失敗しても移る', async () => {
    vi.useFakeTimers()
    const go = vi.fn()
    const p = signOutAndGoHome({ signOut: () => new Promise(() => {}), go, waitLimitMs: 1500, to: '/login?redirect=%2Fx' })
    await vi.advanceTimersByTimeAsync(1500)
    await p
    expect(go).toHaveBeenCalledWith('/login?redirect=%2Fx')
    const go2 = vi.fn()
    await signOutAndGoHome({ signOut: async () => { throw new Error('boom') }, go: go2, to: '/login' })
    expect(go2).toHaveBeenCalledWith('/login')
    const go3 = vi.fn()
    await signOutAndGoHome({ signOut: async () => {}, go: go3 })
    expect(go3).toHaveBeenCalledWith('/')
  })
})

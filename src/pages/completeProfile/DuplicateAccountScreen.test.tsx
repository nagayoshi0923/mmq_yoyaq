// @vitest-environment jsdom
// 2026-10-29 社長承認: ログインはできたが、このメールアドレスのお客様情報が別のログインに結び付いているときの案内。
// 以前は「このメールは既に登録されています」「新規登録フローを続けると…」と出し、ログインした人にも新規登録を選んだように見えていた
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
vi.mock('@/lib/supabase', () => ({ supabase: { auth: {} } }))
import { DuplicateAccountScreen } from './StatusScreens'

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

  it('ログアウトできたと分かってから、安全な戻り先つきのログイン画面へ。二度押しでも 1 回だけ', async () => {
    let done!: (v: { error: null }) => void
    const signOut = vi.fn(() => new Promise<{ error: null }>((r) => { done = r }))
    const go = vi.fn()
    sessionStorage.setItem('oauth_mode', 'login')
    await render({ returnTo: '/queens-waltz/scenario/kaku?tab=private', signOut, go })
    await act(async () => { chooseAgain().click(); chooseAgain().click() })
    expect(signOut).toHaveBeenCalledTimes(1)
    expect(chooseAgain().disabled).toBe(true)
    expect(go).not.toHaveBeenCalled()
    await act(async () => { done({ error: null }) })
    expect(go).toHaveBeenCalledTimes(1)
    expect(go).toHaveBeenCalledWith('/login?redirect=' + encodeURIComponent('/queens-waltz/scenario/kaku?tab=private'))
    expect(sessionStorage.getItem('oauth_mode')).toBeNull()
  })

  it.each([
    ['{ error } が返る', () => Promise.resolve({ error: { message: 'boom' } })],
    ['投げる', () => Promise.reject(new Error('network'))],
  ])('ログアウトが失敗（%s）したら移動せず、理由と「もう一度」を出す。もう一度で成功すれば移動', async (_label, fail) => {
    const signOut = vi.fn(fail as () => Promise<{ error?: unknown }>)
    const go = vi.fn()
    await render({ signOut, go })
    await act(async () => chooseAgain().click())
    expect(go).not.toHaveBeenCalled()
    expect(host.querySelector('[data-testid="duplicate-account-signout-error"]')).not.toBeNull()
    expect(chooseAgain().disabled).toBe(false)
    signOut.mockImplementation(() => Promise.resolve({ error: null }) as never)
    await act(async () => chooseAgain().click())
    expect(go).toHaveBeenCalledWith('/login')
  })

  it('ログアウトが返ってこなければ、上限時間で移動せずに「もう一度」を出す。あとで遅れて成功しても勝手に移動しない', async () => {
    vi.useFakeTimers()
    let late!: (v: { error: null }) => void
    const signOut = vi.fn(() => new Promise<{ error: null }>((r) => { late = r }))
    const go = vi.fn()
    await render({ signOut, go, limitMs: 3000 })
    await act(async () => chooseAgain().click())
    await act(async () => { await vi.advanceTimersByTimeAsync(3000) })
    expect(go).not.toHaveBeenCalled()
    expect(host.querySelector('[data-testid="duplicate-account-signout-error"]')).not.toBeNull()
    await act(async () => { late({ error: null }); await vi.advanceTimersByTimeAsync(1) })
    expect(go).not.toHaveBeenCalled()
  })

  it('画面を離れたあとにログアウトの結果が届いても移動しない（別の利用者・別の画面に作用しない）', async () => {
    let late!: (v: { error: null }) => void
    const go = vi.fn()
    await render({ signOut: () => new Promise((r) => { late = r }), go })
    await act(async () => chooseAgain().click())
    await act(async () => root.unmount())
    await act(async () => { late({ error: null }) })
    expect(go).not.toHaveBeenCalled()
    root = createRoot(host)
  })

  it.each([[null, '/login'], ['https://evil.example/x', '/login'], ['//evil.example', '/login']])('戻り先 %s は安全な内部 URL でなければ付けない（%s）', async (returnTo, to) => {
    const go = vi.fn()
    await render({ returnTo, signOut: async () => ({ error: null }), go })
    await act(async () => chooseAgain().click())
    expect(go).toHaveBeenCalledWith(to)
  })
})

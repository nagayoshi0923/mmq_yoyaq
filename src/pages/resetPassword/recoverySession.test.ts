import { describe, expect, it, vi } from 'vitest'
import type { Session } from '@supabase/supabase-js'
import { ensureRecoverySession } from './recoverySession'

const session = (token: string) => ({ access_token: token }) as unknown as Session

function fakeAuth(current: Session | null, setResult: { session: Session | null; error: { message: string } | null } = { session: null, error: null }) {
  return {
    getSession: vi.fn(async () => ({ data: { session: current } })),
    setSession: vi.fn(async () => ({ data: { session: setResult.session }, error: setResult.error })),
    signOut: vi.fn(),
  }
}

describe('ensureRecoverySession（パスワード再設定のログイン状態）', () => {
  it('リンクでできたログインが有効なら、そのまま使い、ログアウトも setSession もしない（2026-11-13 本番障害の再発防止）', async () => {
    const auth = fakeAuth(session('A'))
    expect(await ensureRecoverySession(auth, { accessToken: 'A', refreshToken: 'R' })).toEqual({ ok: true })
    expect(auth.setSession).not.toHaveBeenCalled()
    expect(auth.signOut).not.toHaveBeenCalled()
  })

  it('ログインが無いときだけ setSession する', async () => {
    const auth = fakeAuth(null, { session: session('A'), error: null })
    expect(await ensureRecoverySession(auth, { accessToken: 'A', refreshToken: 'R' })).toEqual({ ok: true })
    expect(auth.setSession).toHaveBeenCalledWith({ access_token: 'A', refresh_token: 'R' })
    expect(auth.signOut).not.toHaveBeenCalled()
  })

  it('使用済み・期限切れは、その旨を伝える', async () => {
    const auth = fakeAuth(null, { session: null, error: { message: 'Session from session_id claim in JWT does not exist' } })
    const result = await ensureRecoverySession(auth, { accessToken: 'A', refreshToken: 'R' })
    expect(result.ok).toBe(false)
    const notFound = fakeAuth(null, { session: null, error: { message: 'Session not found' } })
    expect(await ensureRecoverySession(notFound, { accessToken: 'A', refreshToken: 'R' })).toMatchObject({ ok: false, message: expect.stringContaining('すでに使われています') })
  })

  it('トークンが無くても、既にログインしていれば続ける。無ければ止める', async () => {
    expect(await ensureRecoverySession(fakeAuth(session('X')), { accessToken: null, refreshToken: null })).toEqual({ ok: true })
    expect((await ensureRecoverySession(fakeAuth(null), { accessToken: null, refreshToken: null })).ok).toBe(false)
  })
})

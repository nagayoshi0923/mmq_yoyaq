import { afterEach, describe, expect, it, vi } from 'vitest'
vi.mock('@/lib/supabase', () => ({ supabase: { auth: { signOut: vi.fn() } } }))
import { signOutAndGoHome, SIGN_OUT_WAIT_LIMIT_MS } from './signOutAndGoHome'
import { SUCCESS_REDIRECT_DELAY_MS, successRedirectMessage } from './successRedirect'

describe('登録完了画面の文言（点検 #26）', () => {
  it('実際に移るまでの秒数と移動先を出す', () => {
    expect(SUCCESS_REDIRECT_DELAY_MS).toBe(2000)
    expect(successRedirectMessage('coupon')).toBe('2秒後に登録特典のクーポンの画面へ移動します...')
    expect(successRedirectMessage('top')).toBe('2秒後にトップページへ移動します...')
    expect(successRedirectMessage('previous')).toBe('2秒後に元の画面へ移動します...')
  })
})

describe('ログアウトしてトップページに戻る（点検 #8）', () => {
  afterEach(() => { vi.useRealTimers() })

  it('ログアウトが返ってこなくても上限時間でトップへ移る', async () => {
    vi.useFakeTimers()
    const go = vi.fn()
    const done = signOutAndGoHome({ signOut: () => new Promise(() => {}), go })
    await vi.advanceTimersByTimeAsync(SIGN_OUT_WAIT_LIMIT_MS - 1)
    expect(go).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)
    await done
    expect(go).toHaveBeenCalledExactlyOnceWith('/')
  })

  it('ログアウトが失敗してもトップへ移る', async () => {
    const go = vi.fn()
    await signOutAndGoHome({ signOut: () => Promise.reject(new Error('network')), go })
    expect(go).toHaveBeenCalledExactlyOnceWith('/')
  })

  it('ログアウトがすぐ終われば待たずに移る', async () => {
    const go = vi.fn()
    const signOut = vi.fn().mockResolvedValue({ error: null })
    await signOutAndGoHome({ signOut, go })
    expect(signOut).toHaveBeenCalledTimes(1)
    expect(go).toHaveBeenCalledExactlyOnceWith('/')
  })
})

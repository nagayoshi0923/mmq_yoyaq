// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import {
  buildAuthUrl,
  buildCompleteProfilePath,
  buildSignupEmailRedirectTo,
  forgetReturnUrl,
  loginUrlWithIntent,
  normalizeReturnTo,
  readAuthIntent,
  readReturnToFromSearch,
  rememberReturnUrl,
  RETURN_URL_STORAGE_KEY,
} from './authReturn'

const BOOKING = '/queens-waltz/scenario/usagi?event=e1&count=3'

describe('ログイン・登録の戻り先（点検 1・3・25）', () => {
  afterEach(() => sessionStorage.clear())

  it('戻り先はログイン画面の URL に載せる', () => {
    expect(buildAuthUrl('login', BOOKING)).toBe(`/login?redirect=${encodeURIComponent(BOOKING)}`)
    expect(buildAuthUrl('signup', '/group/invite/ABC')).toBe('/signup?redirect=%2Fgroup%2Finvite%2FABC')
    expect(readReturnToFromSearch(`?redirect=${encodeURIComponent(BOOKING)}`)).toBe(BOOKING)
  })

  it('確認メールのリンクに戻り先（next）を載せる', () => {
    expect(buildSignupEmailRedirectTo('https://mmq.game', BOOKING)).toBe(
      `https://mmq.game/complete-profile?next=${encodeURIComponent(BOOKING)}`,
    )
    expect(buildSignupEmailRedirectTo('https://mmq.game', null)).toBe('https://mmq.game/complete-profile')
  })

  it('外部サイト・認証画面・トップは戻り先にしない', () => {
    expect(normalizeReturnTo('https://evil.example/')).toBeNull()
    expect(normalizeReturnTo('//evil.example')).toBeNull()
    expect(normalizeReturnTo('/login?redirect=/x')).toBeNull()
    expect(normalizeReturnTo('/complete-profile?next=/x')).toBeNull()
    expect(normalizeReturnTo('/')).toBeNull()
    expect(buildAuthUrl('login', '/')).toBe('/login')
    expect(buildCompleteProfilePath('/terms')).toBe('/complete-profile')
  })

  it('タブ内の戻り先は消せる（古い戻り先へ飛ばない）', () => {
    rememberReturnUrl('/stores')
    expect(sessionStorage.getItem(RETURN_URL_STORAGE_KEY)).toBe('/stores')
    forgetReturnUrl()
    expect(sessionStorage.getItem(RETURN_URL_STORAGE_KEY)).toBeNull()
  })

  it('「何を予約しようとしているか」は同じ戻り先のときだけ出す', () => {
    const url = loginUrlWithIntent('login', BOOKING, '「ウサギ」10月12日(日) 14:00〜・3名')
    expect(url).toBe(buildAuthUrl('login', BOOKING))
    expect(readAuthIntent(BOOKING)?.label).toBe('「ウサギ」10月12日(日) 14:00〜・3名')
    expect(readAuthIntent('/queens-waltz/scenario/other')).toBeNull()
    expect(readAuthIntent(null)).toBeNull()
  })
})

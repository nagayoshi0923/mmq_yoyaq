// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import {
  buildAuthUrl,
  captureOAuthCallbackIntent,
  readOAuthCallbackReturnTo,
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
  afterEach(() => { forgetReturnUrl(); sessionStorage.clear(); window.history.replaceState({}, '', '/') })

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


describe('OAuth callbackの戻り先をSDKのハッシュ処理前に保持', () => {
  it('トークンを保持せず戻り先だけを保存し、ハッシュ消去後も参照できる', () => {
    sessionStorage.setItem('oauth_mode', 'login'); rememberReturnUrl(BOOKING)
    window.history.replaceState({}, '', '/login#access_token=fixture&refresh_token=fixture')
    captureOAuthCallbackIntent()
    window.history.replaceState({}, '', '/login#')
    expect(readOAuthCallbackReturnTo()).toBe(BOOKING)
    forgetReturnUrl()
    expect(readOAuthCallbackReturnTo()).toBeNull()
  })
  it('通常のloginやパスワード回復では古い戻り先を保護しない', () => {
    sessionStorage.setItem('oauth_mode', 'login'); rememberReturnUrl(BOOKING)
    window.history.replaceState({}, '', '/login')
    captureOAuthCallbackIntent(); expect(readOAuthCallbackReturnTo()).toBeNull()
    window.history.replaceState({}, '', '/login#access_token=fixture&refresh_token=fixture&type=recovery')
    captureOAuthCallbackIntent(); expect(readOAuthCallbackReturnTo()).toBeNull()
  })
  it('外部URLは保持しない', () => {
    sessionStorage.setItem('oauth_mode', 'login'); sessionStorage.setItem('returnUrl', 'https://example.invalid')
    window.history.replaceState({}, '', '/login#access_token=fixture&refresh_token=fixture')
    captureOAuthCallbackIntent(); expect(readOAuthCallbackReturnTo()).toBeNull()
  })
})

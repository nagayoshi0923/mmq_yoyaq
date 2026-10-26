// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import {
  buildAuthUrl,
  buildCompleteProfilePath,
  buildSignupEmailRedirectTo,
  decideSignedInReturnRedirect,
  isAuthEntryPath,
  resolveLoginReturnTo,
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

describe('ログイン直後の戻り先の決め方（QW-20261023-001）', () => {
  const PRIVATE = '/queens-waltz/scenario/usagi?tab=private&stores=s1'
  const at = (pathname: string, search = '', hash = '') => ({ pathname, search, hash })

  it('ログイン・新規登録の画面かを見分ける', () => {
    expect(isAuthEntryPath('/login')).toBe(true)
    expect(isAuthEntryPath('/signup/')).toBe(true)
    expect(isAuthEntryPath('/queens-waltz/login')).toBe(true)
    expect(isAuthEntryPath('/queens-waltz/scenario/login-murder')).toBe(false)
    expect(isAuthEntryPath('/')).toBe(false)
  })

  it('メール＋パスワードの戻り先は URL を正とし、タブ内の記憶は補助', () => {
    expect(resolveLoginReturnTo(PRIVATE, null)).toBe(PRIVATE)
    expect(resolveLoginReturnTo(PRIVATE, '/stores')).toBe(PRIVATE)
    expect(resolveLoginReturnTo(null, PRIVATE)).toBe(PRIVATE)
    expect(resolveLoginReturnTo('//evil.example', '/\\evil.example')).toBeNull()
  })

  it('トップ・組織トップ・別の作品に着いたら戻り先へ送る', () => {
    expect(decideSignedInReturnRedirect(at('/'), PRIVATE)).toEqual({ target: PRIVATE, consume: true })
    expect(decideSignedInReturnRedirect(at('/queens-waltz'), PRIVATE)).toEqual({ target: PRIVATE, consume: true })
    expect(decideSignedInReturnRedirect(at('/queens-waltz/scenario/other'), PRIVATE)).toEqual({ target: PRIVATE, consume: true })
  })

  it('同じ作品でもクエリが欠けていれば戻り先のクエリに置き換え、完全に同じなら送らない', () => {
    expect(decideSignedInReturnRedirect(at('/queens-waltz/scenario/usagi'), PRIVATE)).toEqual({ target: PRIVATE, consume: true })
    expect(decideSignedInReturnRedirect(at('/queens-waltz/scenario/usagi', '?tab=private'), PRIVATE)).toEqual({ target: PRIVATE, consume: true })
    expect(decideSignedInReturnRedirect(at('/queens-waltz/scenario/usagi', '?tab=private&stores=s1'), PRIVATE)).toEqual({ target: null, consume: true })
  })

  it('ログイン画面では触らず、プロフィール登録画面・危ない戻り先は片付けるだけ', () => {
    expect(decideSignedInReturnRedirect(at('/login', '?redirect=x'), PRIVATE)).toEqual({ target: null, consume: false })
    expect(decideSignedInReturnRedirect(at('/complete-profile', '?next=x'), PRIVATE)).toEqual({ target: null, consume: true })
    expect(decideSignedInReturnRedirect(at('/'), '/\\evil.example')).toEqual({ target: null, consume: true })
    expect(decideSignedInReturnRedirect(at('/'), null)).toEqual({ target: null, consume: false })
  })

  it('外へ出る形の戻り先は拒否する（バックスラッシュ・改行・タブ・エンコード）', () => {
    for (const evil of ['/\\evil.example', '/\n/evil.example', '/\t/evil.example', '%2F%2Fevil.example', 'javascript:alert(1)', 'https://evil.example', '//evil.example']) {
      expect(normalizeReturnTo(evil)).toBeNull()
    }
    expect(normalizeReturnTo('/queens-waltz/scenario/usagi?tab=private&date=2026-11-01')).toBe('/queens-waltz/scenario/usagi?tab=private&date=2026-11-01')
  })
})

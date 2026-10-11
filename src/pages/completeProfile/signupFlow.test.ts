import { describe, expect, it } from 'vitest'
import { readSignupLinkError } from './linkError'
import { countRemainingRequired } from './profileRemaining'

describe('確認メールのリンクの期限切れ（点検 11）', () => {
  it('期限切れ・使用済みを読む', () => {
    expect(readSignupLinkError('#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired', '')).toBe('expired')
    expect(readSignupLinkError('', '?error=access_denied&error_description=Email+link+is+invalid+or+has+expired')).toBe('expired')
    expect(readSignupLinkError('#error=server_error&error_code=unexpected_failure', '')).toBe('other')
    expect(readSignupLinkError('#access_token=x', '?next=%2Fx')).toBeNull()
  })
})

describe('プロフィール登録の残り項目（点検 10。必須は減らさない）', () => {
  const empty = { name: '', phone: '', prefecture: '', birthDate: '', isOAuthUser: false, password: '', confirmPassword: '', acceptTerms: false }

  it('メール登録は 7 項目（お名前・電話・都道府県・生年月日・パスワード 2 回・同意）', () => {
    expect(countRemainingRequired(empty)).toEqual({ remaining: 7, total: 7 })
  })

  it('Google 登録はパスワードが無い分 5 項目', () => {
    expect(countRemainingRequired({ ...empty, isOAuthUser: true })).toEqual({ remaining: 5, total: 5 })
  })

  it('形の合わない電話・生年月日、一致しないパスワードは残りに数える', () => {
    const r = countRemainingRequired({
      name: '山田', phone: '123', prefecture: '東京都', birthDate: '1990/1', isOAuthUser: false,
      password: 'abcdef', confirmPassword: 'abcdeg', acceptTerms: true,
    })
    expect(r.remaining).toBe(3)
  })

  it('すべて入ると 0', () => {
    expect(countRemainingRequired({
      name: '山田 太郎', phone: '090-1234-5678', prefecture: '東京都', birthDate: '1990/01/15', isOAuthUser: false,
      password: 'abcdef', confirmPassword: 'abcdef', acceptTerms: true,
    }).remaining).toBe(0)
  })
})

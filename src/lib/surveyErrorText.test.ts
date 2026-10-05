import { describe, expect, it } from 'vitest'
import { surveyErrorText } from './surveyErrorText'

describe('アンケートの失敗の文', () => {
  it('DB からの日本語の理由があれば添える', () => {
    expect(surveyErrorText('送信に失敗しました', { message: '本人確認が必要です。メールアドレスとPINで入り直してください' })).toBe('送信に失敗しました（本人確認が必要です。メールアドレスとPINで入り直してください）')
  })
  it('英語だけの内部の文や理由なしは既定の文だけ', () => {
    expect(surveyErrorText('送信に失敗しました', { message: 'Failed to fetch' })).toBe('送信に失敗しました')
    expect(surveyErrorText('送信に失敗しました', null)).toBe('送信に失敗しました')
  })
})

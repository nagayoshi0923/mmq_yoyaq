import { describe, expect, it } from 'vitest'
import { privateCancelNoticeText } from './privateCancelNotice'

describe('貸切の取消の案内（点検 35）', () => {
  it('マイページから取り消せるのは 30 日前まで、それ以降は店舗へ（キャンセル料）', () => {
    const text = privateCancelNoticeText()
    expect(text).toContain('マイページから取り消せるのは公演の30日前まで')
    expect(text).toContain('店舗へご連絡ください')
    expect(text).toContain('7日前からはキャンセル料がかかります')
  })
})

import { describe, expect, it } from 'vitest'
import { privateBookingErrorText } from './privateBookingErrors'

describe('privateBookingErrorText', () => {
  it('メッセージの英字のコードを日本語にする', () => {
    expect(privateBookingErrorText(new Error('PRIVATE_BOOKING_OUTSIDE_PERFORMANCE_PERIOD'))).toBe('この作品の公演期間外の候補日があります。公演期間内の日程を選び直してください。')
    expect(privateBookingErrorText({ message: 'PRIVATE_BOOKING_DEADLINE_PASSED', code: 'P0045' })).toContain('受付締切を過ぎた')
  })
  it('SQLSTATE だけでも日本語にする', () => {
    expect(privateBookingErrorText({ code: 'P0044', message: '' })).toContain('貸切の募集期間外')
  })
  it('日本語のメッセージはそのまま、知らない英字のコードは代わりの文', () => {
    expect(privateBookingErrorText(new Error('ログインが必要です'))).toBe('ログインが必要です')
    expect(privateBookingErrorText(new Error('SOME_UNKNOWN_CODE'), '送れませんでした')).toBe('送れませんでした')
    expect(privateBookingErrorText(null, '送れませんでした')).toBe('送れませんでした')
  })
})

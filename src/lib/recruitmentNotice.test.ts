import { describe, expect, it } from 'vitest'
import { recruitmentNotice } from '../../supabase/functions/_shared/recruitment-notice'
const snapshot = { scenario: '<script>test</script>', date: '2026-09-07', start_time: '19:00:00', store_name: '本店', deadline: '2026-09-07T08:30:00Z', was_confirmed: true, site_url: 'https://example.invalid/queens-waltz' }
describe('追加募集の顧客案内', () => {
  it('日本時間の90分前期限・判断待ちの無料辞退・確認操作を伝える', () => {
    const notice = recruitmentNotice(snapshot, 'token')
    expect(notice.text).toContain('17:30')
    expect(notice.text).toContain('開演90分前')
    expect(notice.text).toContain('開催決定後にキャンセル')
    expect(notice.text).toContain('開催判断待ちの間')
    expect(notice.text).toContain('開くだけでは予約は変更されません')
    expect(notice.text).toContain('https://example.invalid/recruitment-response#token')
    expect(notice.html).not.toContain('<script>')
  })
  it('開催未決定でキャンセルがあったとは言わない', () => {
    expect(recruitmentNotice({ ...snapshot, was_confirmed: false }, 'token').text).not.toContain('開催決定後にキャンセル')
  })
  it('最終案内と辞退完了を区別する', () => {
    expect(recruitmentNotice(snapshot, 'token', 'confirmed').text).toContain('開催が決定しました')
    expect(recruitmentNotice(snapshot, 'token', 'cancelled').text).toContain('キャンセル料はかかりません')
    expect(recruitmentNotice(snapshot, 'token', 'withdrawn').text).toContain('キャンセル料は0円')
    expect(recruitmentNotice(snapshot, 'token', 'confirmed').text).not.toContain('recruitment-response')
  })
})

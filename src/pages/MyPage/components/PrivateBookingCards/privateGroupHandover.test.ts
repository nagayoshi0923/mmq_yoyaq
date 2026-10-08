import { describe, expect, it } from 'vitest'
import {
  canRequestHandoverTo,
  formatHandoverDeadline,
  handoverDeclineConfirmText,
  handoverRequestConfirmText,
  handoverWaitingLabel,
} from './privateGroupHandover'

const pending = { id: 'h1', fromName: 'いちこ', toName: '二郎', toMemberId: 'm2', expiresAt: '2026-10-12T12:00:00Z', isRecipient: false }

describe('「主催者にする」を出す行', () => {
  it('会員（アカウントあり）の自分以外のメンバーだけ', () => {
    expect(canRequestHandoverTo({ id: 'm2', role: 'member' }, 'm1', null)).toBe(true)
  })
  it('ゲスト・主催者・自分の行には出さない', () => {
    expect(canRequestHandoverTo({ id: 'g1', role: 'guest' }, 'm1', null)).toBe(false)
    expect(canRequestHandoverTo({ id: 'm1', role: 'organizer' }, 'm1', null)).toBe(false)
    expect(canRequestHandoverTo({ id: 'm1', role: 'member' }, 'm1', null)).toBe(false)
  })
  it('依頼中（同時 1 件まで）は誰にも出さない', () => {
    expect(canRequestHandoverTo({ id: 'm3', role: 'member' }, 'm1', pending)).toBe(false)
  })
})

describe('文言', () => {
  it('期限は JST の月日・曜日・時刻', () => {
    expect(formatHandoverDeadline('2026-10-12T12:00:00Z')).toBe('10/12(月) 21:00')
  })
  it('元主催者のカードのラベル', () => {
    expect(handoverWaitingLabel(pending)).toBe('二郎さんの同意待ち（主催者の引き継ぎ）')
  })
  it('依頼の確認文は「同意するまであなたが主催者のまま」を伝える', () => {
    expect(handoverRequestConfirmText('二郎').message).toContain('二郎さんに主催者の引き継ぎを依頼します。二郎さんが同意するまで、あなたが主催者のままです。')
  })
  it('断る確認文', () => {
    expect(handoverDeclineConfirmText('いちこ').message).toContain('いちこさんが主催者のままです')
  })
})

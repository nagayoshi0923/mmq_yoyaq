import { describe, expect, it } from 'vitest'
import { privateGroupGuideText, withPrivateGroupGuide } from './privateGroupGuide'
import { privateGroupGuideText as sentGuideText, buildPrivateConfirmationPayload } from '../../supabase/functions/_shared/private-confirmation-payload'
import { renderTemplateWithSamples } from './templateRegistry'

describe('貸切の確定メールのグループ案内（#831）', () => {
  it('画面の文面は、送信側の文面と同じ', () => {
    expect(privateGroupGuideText('https://example.invalid/g')).toBe(sentGuideText('https://example.invalid/g'))
  })

  it('プレビューは送信時と同じく、{group_url} が無い文面の末尾に案内を付ける', () => {
    const template = '{customer_name} 様\n貸切が確定しました'
    const sent: any = buildPrivateConfirmationPayload(
      { reservationId: 'r', customerEmail: 'c@example.invalid', customerName: '幹事', scenarioTitle: '作品', eventDate: '2027-01-16', startTime: '19:30:00', endTime: '23:00:00', storeName: '店舗', participantCount: 6, totalPrice: 0, reservationNumber: 'x', groupUrl: 'https://mmq.game/group/invite/abc' },
      { senderEmail: 's@example.invalid', senderName: '店', supabaseUrl: 'https://example.invalid', storeEmailSettings: { private_confirm_template: template } },
    )
    const preview = renderTemplateWithSamples(template, { customer_name: '幹事', group_url: 'https://mmq.game/group/invite/abc' }, 'private_confirm_template')
    expect(preview).toBe(sent.text)
  })

  it('{group_url} を文面に入れた場合は付けない。ほかの文面には付けない', () => {
    expect(withPrivateGroupGuide('入室: {group_url}', 'x')).toBe('入室: {group_url}')
    expect(renderTemplateWithSamples('本文', {}, 'reminder_template')).toBe('本文')
  })
})

import { describe, expect, it } from 'vitest'
import { toApplicantChange } from './applicantChanges'

describe('申込者の変更履歴', () => {
  it('旧申込者（予約の氏名）→ 新申込者（同意時の連絡先の氏名）', () => {
    expect(toApplicantChange({
      id: 'h1', reservation_id: 'r1', responded_at: '2026-10-09T00:00:00Z',
      previous_customer: { customer_name: '試験 一子', display_name: 'いちこ' }, accepted_contact: { name: '試験 二郎' },
    })).toEqual({ id: 'h1', reservation_id: 'r1', responded_at: '2026-10-09T00:00:00Z', from_name: '試験 一子', to_name: '試験 二郎' })
  })
  it('予約に結びつかない（申込前の）引き継ぎは出さない', () => {
    expect(toApplicantChange({ id: 'h2', reservation_id: null, responded_at: '2026-10-09T00:00:00Z', previous_customer: null, accepted_contact: { name: 'x' } })).toBeNull()
  })
})

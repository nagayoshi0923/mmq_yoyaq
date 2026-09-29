import { describe, expect, it } from 'vitest'
import { canEditCustomer } from './customerEditAccess'

describe('canEditCustomer', () => {
  it('自組織の顧客と組織未所属の共通顧客は編集できる', () => {
    expect(canEditCustomer({ organization_id: 'org-a' }, 'org-a', false)).toBe(true)
    expect(canEditCustomer({ organization_id: undefined }, 'org-a', false)).toBe(true)
  })
  it('他組織所有の顧客は編集できない', () => {
    expect(canEditCustomer({ organization_id: 'org-b' }, 'org-a', false)).toBe(false)
    expect(canEditCustomer({ organization_id: 'org-b' }, null, false)).toBe(false)
  })
  it('ライセンス管理者は他組織の顧客も編集できる', () => {
    expect(canEditCustomer({ organization_id: 'org-b' }, 'org-a', true)).toBe(true)
  })
})

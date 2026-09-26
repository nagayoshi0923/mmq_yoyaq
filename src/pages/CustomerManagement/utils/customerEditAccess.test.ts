import { expect, it } from 'vitest'
import { getCustomerEditAccess, isCustomerOwnedByOrganization } from './customerEditAccess'

it('自組織所有のみ編集可と判定する', () => {
  expect(getCustomerEditAccess({ organization_id: 'org-a' }, 'org-a')).toBe(true)
  expect(getCustomerEditAccess({ organization_id: 'org-b' }, 'org-a')).toBe(false)
  expect(getCustomerEditAccess({ organization_id: 'org-a' }, null)).toBe(null)
  expect(getCustomerEditAccess({ organization_id: undefined }, 'org-a')).toBe(null)
  expect(getCustomerEditAccess(null, 'org-a')).toBe(true)
  expect(isCustomerOwnedByOrganization({ organization_id: 'org-a' }, 'org-a')).toBe(true)
  expect(isCustomerOwnedByOrganization({ organization_id: 'org-b' }, 'org-a')).toBe(false)
  expect(isCustomerOwnedByOrganization({ organization_id: 'org-a' }, null)).toBe(false)
})

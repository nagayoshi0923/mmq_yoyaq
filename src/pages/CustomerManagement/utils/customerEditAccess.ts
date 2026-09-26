import type { Customer } from '@/types'

/**
 * 自組織所有なら true、他組織接点のみなら false。
 * 組織ID未取得などで判定不能なときは null。
 */
export function getCustomerEditAccess(
  customer: Pick<Customer, 'organization_id'> | null | undefined,
  organizationId: string | null | undefined,
): boolean | null {
  if (!customer) return true
  if (!customer.organization_id || !organizationId) return null
  return customer.organization_id === organizationId
}

export function isCustomerOwnedByOrganization(
  customer: Pick<Customer, 'organization_id'> | null | undefined,
  organizationId: string | null | undefined,
): boolean {
  return getCustomerEditAccess(customer, organizationId) === true
}

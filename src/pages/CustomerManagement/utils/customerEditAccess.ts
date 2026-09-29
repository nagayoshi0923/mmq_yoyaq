import type { Customer } from '@/types'

/**
 * 顧客を編集できるか（DBの RLS `customers_update` と同じ条件）。
 * - ライセンス管理者（is_license_admin）: すべて
 * - 自組織の顧客、または組織未所属の共通顧客（一覧に出るのは予約接点がある顧客のみ）
 * 他組織所有の顧客は保存しても RLS で更新されないため、編集操作を出さない（#561）。
 */
export function canEditCustomer(
  customer: Pick<Customer, 'organization_id'>,
  organizationId: string | null,
  isLicenseManager: boolean,
): boolean {
  if (isLicenseManager) return true
  if (customer.organization_id == null) return true
  return organizationId != null && customer.organization_id === organizationId
}

/**
 * AppRoot のプロフィール必須ガードと CompleteProfile の「既に完了」を揃える
 */
export type CustomerProfileRow = {
  name?: string | null
  phone?: string | null
  email?: string | null
} | null

export function isCustomerProfileComplete(
  customer: CustomerProfileRow,
  sessionEmail: string | null | undefined
): boolean {
  const nameOk = Boolean(customer?.name && String(customer.name).trim().length > 0)
  const phoneOk = Boolean(customer?.phone && String(customer.phone).trim().length > 0)
  const emailOk = Boolean(
    (customer?.email && String(customer.email).trim().length > 0) ||
      (sessionEmail && String(sessionEmail).trim().length > 0)
  )
  return nameOk && phoneOk && emailOk
}

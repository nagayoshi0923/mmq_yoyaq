export const customerSortKeys = ['created_at', 'name', 'email', 'phone', 'reservation_count', 'remaining_coupons', 'visit_count', 'reservation_amount', 'last_visit'] as const
export type CustomerSortKey = typeof customerSortKeys[number]
export interface CustomerListOptions {
  sortBy?: CustomerSortKey
  sortDir?: 'asc' | 'desc'
  minReservations?: number
  minVisits?: number
  minAmount?: number
  hasCoupons?: boolean
  visitFrom?: string
  visitTo?: string
}

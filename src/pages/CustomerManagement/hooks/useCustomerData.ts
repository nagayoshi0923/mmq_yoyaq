import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { getCurrentOrganizationId } from '@/lib/organization'
import type { Customer } from '@/types'
import { logger } from '@/utils/logger'

export interface CustomerCouponStats {
  total_coupons: number
  used_coupons: number
  remaining_coupons: number
}

interface CustomerDataResult {
  customers: Customer[]
  couponStats: Record<string, CustomerCouponStats>
}

export const customerKeys = {
  all: ['customers'] as const,
}

async function fetchCustomersWithStats(): Promise<CustomerDataResult> {
  logger.log('顧客データ取得開始')
  const orgId = await getCurrentOrganizationId()
  const PAGE_SIZE = 1000

  // 顧客一覧をページネーションで全件取得
  let allCustomers: any[] = []
  let from = 0
  for (;;) {
    let query = supabase
      .from('customers')
      .select('id, organization_id, user_id, name, nickname, email, email_verified, phone, address, line_id, notes, avatar_url, visit_count, total_spent, last_visit, preferences, notification_settings, created_at, updated_at')
      .order('created_at', { ascending: false })
      .range(from, from + PAGE_SIZE - 1)
    if (orgId) query = query.eq('organization_id', orgId)
    const { data: pageData, error } = await query
    if (error) throw error
    allCustomers = allCustomers.concat(pageData || [])
    if ((pageData || []).length < PAGE_SIZE) break
    from += PAGE_SIZE
  }

  const customerIds = allCustomers.map(c => c.id)
  const reservationStats: Record<string, { total_paid: number; reservation_count: number; last_visit: string | null; visit_count: number }> = {}
  const couponStats: Record<string, CustomerCouponStats> = {}

  if (customerIds.length > 0) {
    // 予約統計をページネーションで全件取得
    let allReservations: any[] = []
    let resFrom = 0
    for (;;) {
      let resQuery = supabase
        .from('reservations')
        .select('customer_id, total_price, status, requested_datetime')
        .in('customer_id', customerIds)
        .in('status', ['confirmed', 'gm_confirmed', 'completed'])
        .range(resFrom, resFrom + PAGE_SIZE - 1)
      if (orgId) resQuery = resQuery.eq('organization_id', orgId)
      const { data: resPage } = await resQuery
      allReservations = allReservations.concat(resPage || [])
      if ((resPage || []).length < PAGE_SIZE) break
      resFrom += PAGE_SIZE
    }

    allReservations.forEach(res => {
      if (!res.customer_id) return
      if (!reservationStats[res.customer_id]) {
        reservationStats[res.customer_id] = { total_paid: 0, reservation_count: 0, last_visit: null, visit_count: 0 }
      }
      reservationStats[res.customer_id].total_paid += res.total_price || 0
      reservationStats[res.customer_id].reservation_count += 1
      if (res.requested_datetime) {
        const prev = reservationStats[res.customer_id].last_visit
        if (!prev || res.requested_datetime > prev) {
          reservationStats[res.customer_id].last_visit = res.requested_datetime
        }
      }
      if (res.status === 'completed') {
        reservationStats[res.customer_id].visit_count += 1
      }
    })

    // クーポン統計
    const { data: coupons, error: couponError } = await supabase
      .from('customer_coupons')
      .select('id, customer_id, uses_remaining, status, coupon_campaigns (max_uses_per_customer)')
      .in('customer_id', customerIds)
    if (couponError) logger.error('クーポン取得エラー:', couponError)

    coupons?.forEach((coupon: any) => {
      if (!coupon.customer_id) return
      if (!couponStats[coupon.customer_id]) {
        couponStats[coupon.customer_id] = { total_coupons: 0, used_coupons: 0, remaining_coupons: 0 }
      }
      const maxUses = coupon.coupon_campaigns?.max_uses_per_customer || 0
      const remaining = coupon.uses_remaining || 0
      couponStats[coupon.customer_id].total_coupons += maxUses
      couponStats[coupon.customer_id].used_coupons += maxUses - remaining
      couponStats[coupon.customer_id].remaining_coupons += remaining
    })
  }

  const customers = allCustomers.map(customer => ({
    ...customer,
    total_spent: reservationStats[customer.id]?.total_paid || customer.total_spent || 0,
    reservation_count: reservationStats[customer.id]?.reservation_count || 0,
    last_visit: reservationStats[customer.id]?.last_visit ?? customer.last_visit ?? null,
    visit_count: reservationStats[customer.id]?.visit_count ?? customer.visit_count ?? 0,
  }))

  logger.log('顧客データ取得完了:', customers.length)
  return { customers, couponStats }
}

export function useCustomerData() {
  const queryClient = useQueryClient()

  const { data, isLoading } = useQuery<CustomerDataResult>({
    queryKey: customerKeys.all,
    queryFn: fetchCustomersWithStats,
    staleTime: 3 * 60 * 1000, // 3分間キャッシュ
  })

  const refreshCustomers = () =>
    queryClient.invalidateQueries({ queryKey: customerKeys.all })

  return {
    customers: data?.customers ?? [],
    loading: isLoading,
    couponStats: data?.couponStats ?? {},
    refreshCustomers,
  }
}

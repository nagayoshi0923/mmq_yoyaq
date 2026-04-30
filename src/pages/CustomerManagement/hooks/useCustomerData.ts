import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { getCurrentOrganizationId } from '@/lib/organization'
import type { Customer } from '@/types'
import { logger } from '@/utils/logger'
import { showToast } from '@/utils/toast'

export interface CustomerCouponStats {
  total_coupons: number      // 取得したクーポン総数（uses_remaining の初期値の合計）
  used_coupons: number       // 使用済みクーポン数
  remaining_coupons: number  // 残りクーポン数
}

export function useCustomerData() {
  const [customers, setCustomers] = useState<Customer[]>([])
  const [loading, setLoading] = useState(true)
  const [couponStats, setCouponStats] = useState<Record<string, CustomerCouponStats>>({})

  const fetchCustomers = async () => {
    setLoading(true)
    try {
      logger.log('顧客データ取得開始')

      // 組織フィルタリング
      const orgId = await getCurrentOrganizationId()

      // Supabase のデフォルト上限（1000件）を超える場合にすべて取得するためページネーション
      const PAGE_SIZE = 1000
      let allCustomers: any[] = []
      let from = 0
      while (true) {
        let query = supabase
          .from('customers')
          .select('id, organization_id, user_id, name, nickname, email, email_verified, phone, address, line_id, notes, avatar_url, visit_count, total_spent, last_visit, preferences, notification_settings, created_at, updated_at')
          .order('created_at', { ascending: false })
          .range(from, from + PAGE_SIZE - 1)
        if (orgId) {
          query = query.eq('organization_id', orgId)
        }
        const { data: pageData, error } = await query
        if (error) throw error
        allCustomers = allCustomers.concat(pageData || [])
        if ((pageData || []).length < PAGE_SIZE) break
        from += PAGE_SIZE
      }
      const data = allCustomers

      // 予約データから累計支払額と予約数を集計
      const customerIds = data.map(c => c.id)
      const reservationStats: Record<string, { total_paid: number; reservation_count: number }> = {}
      const couponStatsMap: Record<string, CustomerCouponStats> = {}

      if (customerIds.length > 0) {
        let allReservations: any[] = []
        let resFrom = 0
        while (true) {
          let resQuery = supabase
            .from('reservations')
            .select('customer_id, total_price, status')
            .in('customer_id', customerIds)
            .in('status', ['confirmed', 'gm_confirmed', 'completed'])
            .range(resFrom, resFrom + PAGE_SIZE - 1)
          if (orgId) {
            resQuery = resQuery.eq('organization_id', orgId)
          }
          const { data: resPage } = await resQuery
          allReservations = allReservations.concat(resPage || [])
          if ((resPage || []).length < PAGE_SIZE) break
          resFrom += PAGE_SIZE
        }
        const reservations = allReservations

        if (reservations) {
          reservations.forEach(res => {
            if (res.customer_id) {
              if (!reservationStats[res.customer_id]) {
                reservationStats[res.customer_id] = { total_paid: 0, reservation_count: 0 }
              }
              reservationStats[res.customer_id].total_paid += res.total_price || 0
              reservationStats[res.customer_id].reservation_count += 1
            }
          })
        }

        // クーポン情報を取得（組織フィルタなし - クーポンは複数組織で共有される可能性がある）
        const { data: coupons, error: couponError } = await supabase
          .from('customer_coupons')
          .select(`
            id,
            customer_id,
            uses_remaining,
            status,
            coupon_campaigns (max_uses_per_customer)
          `)
          .in('customer_id', customerIds)
        
        if (couponError) {
          logger.error('クーポン取得エラー:', couponError)
        }
        logger.log('取得したクーポン数:', coupons?.length, coupons)
        
        if (coupons) {
          coupons.forEach((coupon: any) => {
            if (coupon.customer_id) {
              if (!couponStatsMap[coupon.customer_id]) {
                couponStatsMap[coupon.customer_id] = { total_coupons: 0, used_coupons: 0, remaining_coupons: 0 }
              }
              const maxUses = coupon.coupon_campaigns?.max_uses_per_customer || 0
              const remaining = coupon.uses_remaining || 0
              const used = maxUses - remaining
              
              couponStatsMap[coupon.customer_id].total_coupons += maxUses
              couponStatsMap[coupon.customer_id].used_coupons += used
              couponStatsMap[coupon.customer_id].remaining_coupons += remaining
            }
          })
        }
      }

      // 顧客データに予約統計をマージ
      const customersWithStats = (data || []).map(customer => ({
        ...customer,
        total_spent: reservationStats[customer.id]?.total_paid || customer.total_spent || 0,
        reservation_count: reservationStats[customer.id]?.reservation_count || 0
      }))

      logger.log('顧客データ取得完了:', customersWithStats.length)
      setCustomers(customersWithStats)
      setCouponStats(couponStatsMap)
    } catch (error) {
      logger.error('顧客データ取得エラー:', error)
      showToast.error('顧客データの取得に失敗しました')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchCustomers()
  }, [])

  const refreshCustomers = () => {
    fetchCustomers()
  }

  return {
    customers,
    loading,
    couponStats,
    refreshCustomers,
  }
}


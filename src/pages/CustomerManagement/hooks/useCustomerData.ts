import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { getCurrentOrganizationId } from '@/lib/organization'
import type { Customer } from '@/types'
import { logger } from '@/utils/logger'
import { showToast } from '@/utils/toast'

export function useCustomerData() {
  const [customers, setCustomers] = useState<Customer[]>([])
  const [loading, setLoading] = useState(true)

  const fetchCustomers = async () => {
    setLoading(true)
    try {
      logger.log('顧客データ取得開始')
      
      // 組織フィルタリング
      const orgId = await getCurrentOrganizationId()
      let query = supabase
        .from('customers')
        .select('id, organization_id, user_id, name, nickname, email, email_verified, phone, address, line_id, notes, avatar_url, visit_count, total_spent, last_visit, preferences, notification_settings, created_at, updated_at')
      
      if (orgId) {
        query = query.eq('organization_id', orgId)
      }
      
      const { data, error } = await query.order('created_at', { ascending: false })

      if (error) throw error

      // 予約データから累計支払額と予約数を集計
      const customerIds = (data || []).map(c => c.id)
      let reservationStats: Record<string, { total_paid: number; reservation_count: number }> = {}
      
      if (customerIds.length > 0) {
        let resQuery = supabase
          .from('reservations')
          .select('customer_id, total_price, status')
          .in('customer_id', customerIds)
          .in('status', ['confirmed', 'gm_confirmed', 'completed'])
        
        if (orgId) {
          resQuery = resQuery.eq('organization_id', orgId)
        }
        
        const { data: reservations } = await resQuery
        
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
      }

      // 顧客データに予約統計をマージ
      const customersWithStats = (data || []).map(customer => ({
        ...customer,
        total_spent: reservationStats[customer.id]?.total_paid || customer.total_spent || 0,
        reservation_count: reservationStats[customer.id]?.reservation_count || 0
      }))

      logger.log('顧客データ取得完了:', customersWithStats.length)
      setCustomers(customersWithStats)
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
    refreshCustomers,
  }
}


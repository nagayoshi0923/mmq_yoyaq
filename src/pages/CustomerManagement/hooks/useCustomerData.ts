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

      logger.log('顧客データ取得完了:', data?.length)
      setCustomers(data || [])
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


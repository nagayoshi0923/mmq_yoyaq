import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
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
      
      const { data, error } = await supabase
        .from('customers')
        .select('*')
        .order('created_at', { ascending: false })

      if (error) throw error

      logger.log('顧客データ取得完了:', data?.length)
      setCustomers(data || [])
    } catch (error) {
      logger.error('顧客データ取得エラー:', error)
      alert('顧客データの取得に失敗しました')
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


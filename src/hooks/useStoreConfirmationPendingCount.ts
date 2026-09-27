import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { apiClient } from '@/lib/apiClient'
import { logger } from '@/utils/logger'
import { useAuth } from '@/contexts/AuthContext'
import { RESERVATION_SOURCE } from '@/lib/constants'

/**
 * 貸切「店舗承認待ち」件数
 * 未確定の申請で、同一候補の必要人数・主副GM資格・在籍が揃うもの。
 */
export function useStoreConfirmationPendingCount() {
  const [count, setCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const { user, isStaff } = useAuth()

  useEffect(() => {
    // 未ログインの場合は実行しない
    if (!user || !isStaff) {
      setCount(0)
      setLoading(false)
      setError(false)
      return
    }

    setCount(0)
    setLoading(true)
    setError(false)
    let disposed = false
    let generation = 0
    const fetchCount = async () => {
      const current = ++generation
      try {
        const result = await apiClient.get<{ count: number }>('/api/reservations?type=gm-pending-count')
        if (!disposed && current === generation) { setCount(result.count); setError(false) }
      } catch (error) {
        if (!disposed && current === generation) setError(true)
        logger.error('貸切・店舗承認待ち件数取得エラー:', error)
      } finally {
        if (!disposed && current === generation) setLoading(false)
      }
    }

    fetchCount()

    // リアルタイム更新をサブスクライブ
    const channel = supabase
      .channel('store-confirmation-pending')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'reservations',
          filter: `reservation_source=eq.${RESERVATION_SOURCE.WEB_PRIVATE}`
        },
        () => {
          fetchCount()
        }
      )
      .on('postgres_changes', { event: '*', schema: 'public', table: 'gm_availability_responses' }, fetchCount)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'staff_scenario_assignments' }, fetchCount)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'staff' }, fetchCount)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'organization_scenarios' }, fetchCount)
      .subscribe()
    // 非公開テーブルのRealtimeが読めない環境でも、回答/担当変更を再取得する。
    const timer = setInterval(fetchCount, 60_000)

    return () => {
      disposed = true
      clearInterval(timer)
      supabase.removeChannel(channel)
    }
  }, [user, isStaff])

  return { count, loading, error }
}


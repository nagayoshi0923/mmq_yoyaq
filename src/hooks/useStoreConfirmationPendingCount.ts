import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { apiClient } from '@/lib/apiClient'
import { logger } from '@/utils/logger'
import { useAuth } from '@/contexts/AuthContext'
import { RESERVATION_SOURCE } from '@/lib/constants'

/**
 * 貸切「店舗承認待ち」件数
 * - gm_confirmed / pending_store ステータス
 * - または pending / pending_gm でGMが回答済み（available_candidatesあり）
 */
export function useStoreConfirmationPendingCount() {
  const [count, setCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const { user, isStaff } = useAuth()

  useEffect(() => {
    // 未ログインの場合は実行しない
    if (!user || !isStaff) {
      setCount(0)
      setLoading(false)
      return
    }

    const fetchCount = async () => {
      try {
        const result = await apiClient.get<{ count: number }>('/api/reservations?type=gm-pending-count')
        setCount(result.count)
      } catch (error) {
        logger.error('貸切・店舗承認待ち件数取得エラー:', error)
      } finally {
        setLoading(false)
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
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [user, isStaff])

  return { count, loading }
}


import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { getCurrentOrganizationId } from '@/lib/organization'
import { logger } from '@/utils/logger'

/**
 * 店舗確認待ちの貸切リクエスト件数を取得するフック
 */
export function useStoreConfirmationPendingCount() {
  const [count, setCount] = useState(0)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchCount = async () => {
      try {
        // 組織フィルタリング
        const orgId = await getCurrentOrganizationId()
        
        // 未対応の貸切リクエストをすべてカウント
        let query = supabase
          .from('reservations')
          .select('*', { count: 'exact', head: true })
          .eq('reservation_source', 'web_private')
          .in('status', ['pending', 'pending_gm', 'gm_confirmed', 'pending_store'])
        
        if (orgId) {
          query = query.eq('organization_id', orgId)
        }

        const { count: pendingCount, error } = await query

        if (error) {
          logger.error('店舗確認待ち件数取得エラー:', error)
          return
        }

        setCount(pendingCount || 0)
      } catch (error) {
        logger.error('店舗確認待ち件数取得エラー:', error)
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
          filter: 'reservation_source=eq.web_private'
        },
        () => {
          fetchCount()
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [])

  return { count, loading }
}


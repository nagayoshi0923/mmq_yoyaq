import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
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
        // gm_confirmed または pending_store のステータスをカウント
        const { count: pendingCount, error } = await supabase
          .from('reservations')
          .select('*', { count: 'exact', head: true })
          .eq('reservation_source', 'web_private')
          .in('status', ['gm_confirmed', 'pending_store'])

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


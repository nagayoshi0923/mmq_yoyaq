import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { getCurrentOrganizationId } from '@/lib/organization'
import { logger } from '@/utils/logger'
import { useAuth } from '@/contexts/AuthContext'

/**
 * 貸切「店舗承認待ち」件数
 * - gm_confirmed / pending_store ステータス
 * - または pending / pending_gm でGMが回答済み（available_candidatesあり）
 */
export function useStoreConfirmationPendingCount() {
  const [count, setCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const { user } = useAuth()

  useEffect(() => {
    // 未ログインの場合は実行しない
    if (!user) {
      setCount(0)
      setLoading(false)
      return
    }

    const fetchCount = async () => {
      try {
        const orgId = await getCurrentOrganizationId()
        
        // 1. gm_confirmed / pending_store のカウント
        let statusQuery = supabase
          .from('reservations')
          .select('id', { count: 'exact', head: true })
          .eq('reservation_source', 'web_private')
          .in('status', ['gm_confirmed', 'pending_store'])
        
        if (orgId) {
          statusQuery = statusQuery.eq('organization_id', orgId)
        }

        const { count: statusCount, error: statusError } = await statusQuery

        if (statusError) {
          logger.error('貸切・店舗承認待ち件数取得エラー:', statusError)
          return
        }

        // 2. pending / pending_gm でGMが回答済みのものをカウント
        let pendingQuery = supabase
          .from('reservations')
          .select(`
            id,
            gm_availability_responses!inner(available_candidates)
          `)
          .eq('reservation_source', 'web_private')
          .in('status', ['pending', 'pending_gm'])
        
        if (orgId) {
          pendingQuery = pendingQuery.eq('organization_id', orgId)
        }

        const { data: pendingWithGM, error: pendingError } = await pendingQuery

        if (pendingError) {
          // inner joinでエラーになる場合があるので、エラーは無視してstatusCountのみ使う
          setCount(statusCount || 0)
          setLoading(false)
          return
        }

        // GMが回答済み（available_candidatesが空でない）の予約をカウント
        const gmConfirmedPendingCount = pendingWithGM?.filter(r => {
          const responses = r.gm_availability_responses as any[]
          return responses?.some(resp => resp.available_candidates && resp.available_candidates.length > 0)
        }).length || 0

        setCount((statusCount || 0) + gmConfirmedPendingCount)
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
  }, [user])

  return { count, loading }
}


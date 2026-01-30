import { useState, useEffect } from 'react'
import { logger } from '@/utils/logger'
import { supabase } from '@/lib/supabase'
import { getCurrentOrganizationId } from '@/lib/organization'
import { startOfMonth, endOfMonth, isWithinInterval, parseISO } from '@/lib/dateFns'

export interface ReservationStats {
  total: number
  confirmed: number
  pending: number // 対応待ち（pending, pending_gm, pending_store）
  cancelled: number
  unpaid: number
  monthlyTotal: number // 今月の予約数
  monthlyRevenue: number // 今月の売上見込み
}

export function useReservationStats() {
  const [stats, setStats] = useState<ReservationStats>({
    total: 0,
    confirmed: 0,
    pending: 0,
    cancelled: 0,
    unpaid: 0,
    monthlyTotal: 0,
    monthlyRevenue: 0
  })
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    let isMounted = true

    async function fetchStats() {
      try {
        // 組織フィルタリング
        const orgId = await getCurrentOrganizationId()
        
        // 統計に必要な最小限のカラムのみ取得
        let query = supabase
          .from('reservations')
          .select('status, payment_status, requested_datetime, total_price, final_price')
        
        if (orgId) {
          query = query.eq('organization_id', orgId)
        }
        
        const { data, error } = await query
        
        if (error) throw error

        if (!isMounted) return

        const now = new Date()
        const monthStart = startOfMonth(now)
        const monthEnd = endOfMonth(now)

        const newStats = data.reduce((acc, curr) => {
          // 全件数
          acc.total++

          // ステータス別集計
          if (curr.status === 'confirmed' || curr.status === 'gm_confirmed') {
            acc.confirmed++
          } else if (['pending', 'pending_gm', 'pending_store'].includes(curr.status)) {
            acc.pending++
          } else if (curr.status === 'cancelled') {
            acc.cancelled++
          }

          // 未払い集計（キャンセル済みは除外）
          if (curr.payment_status === 'unpaid' && curr.status !== 'cancelled') {
            acc.unpaid++
          }

          // 月次集計
          if (curr.requested_datetime) {
            try {
              const date = parseISO(curr.requested_datetime)
              if (isWithinInterval(date, { start: monthStart, end: monthEnd })) {
                acc.monthlyTotal++
                // 売上計算（確定済みのみ、またはキャンセル以外？）
                // ここでは「有効な予約」としてキャンセル以外を集計
                if (curr.status !== 'cancelled') {
                  const price = curr.final_price || curr.total_price || 0
                  acc.monthlyRevenue += price
                }
              }
            } catch (e) {
              // 日付パースエラーは無視（不正なデータのスキップ）
              logger.warn('予約日時のパースに失敗:', curr.requested_datetime)
            }
          }

          return acc
        }, {
          total: 0,
          confirmed: 0,
          pending: 0,
          cancelled: 0,
          unpaid: 0,
          monthlyTotal: 0,
          monthlyRevenue: 0
        } as ReservationStats)

        setStats(newStats)
      } catch (err) {
        logger.error('Failed to fetch reservation stats:', err)
      } finally {
        if (isMounted) setIsLoading(false)
      }
    }

    fetchStats()

    // リアルタイム更新のサブスクリプション
    const subscription = supabase
      .channel('reservation-stats')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'reservations' },
        () => {
          fetchStats()
        }
      )
      .subscribe()

    return () => {
      isMounted = false
      subscription.unsubscribe()
    }
  }, [])

  return { stats, isLoading }
}


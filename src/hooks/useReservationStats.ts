import { useState, useEffect } from 'react'
import { logger } from '@/utils/logger'
import { supabase } from '@/lib/supabase'
import { getCurrentOrganizationId } from '@/lib/organization'
import { startOfMonth, endOfMonth } from '@/lib/dateFns'

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

        const now = new Date()
        const monthStart = startOfMonth(now)
        const monthEnd = endOfMonth(now)
        const monthStartISO = monthStart.toISOString()
        const monthEndISO = monthEnd.toISOString()

        // 件数系はサーバ側 count（head: true）で取得し、PostgREST の
        // 既定 max-rows（1000行）による黙った切り捨てを回避する
        let totalQuery = supabase.from('reservations').select('*', { count: 'exact', head: true })
        let confirmedQuery = supabase.from('reservations').select('*', { count: 'exact', head: true })
          .in('status', ['confirmed', 'gm_confirmed'])
        let pendingQuery = supabase.from('reservations').select('*', { count: 'exact', head: true })
          .in('status', ['pending', 'pending_gm', 'pending_store'])
        let cancelledQuery = supabase.from('reservations').select('*', { count: 'exact', head: true })
          .eq('status', 'cancelled')
        let unpaidQuery = supabase.from('reservations').select('*', { count: 'exact', head: true })
          .eq('payment_status', 'unpaid').neq('status', 'cancelled')
        let monthlyTotalQuery = supabase.from('reservations').select('*', { count: 'exact', head: true })
          .gte('requested_datetime', monthStartISO).lte('requested_datetime', monthEndISO)

        // 売上合計（sum）は count では計算できないため、月次スコープに絞った
        // 実データ取得で従来通り集計する（要確認: 月内件数が1000件を超える場合は
        // 従来通り黙って切り捨てられるリスクが残る）
        let monthlyRevenueRowsQuery = supabase
          .from('reservations')
          .select('status, total_price, final_price, requested_datetime')
          .gte('requested_datetime', monthStartISO).lte('requested_datetime', monthEndISO)

        if (orgId) {
          totalQuery = totalQuery.eq('organization_id', orgId)
          confirmedQuery = confirmedQuery.eq('organization_id', orgId)
          pendingQuery = pendingQuery.eq('organization_id', orgId)
          cancelledQuery = cancelledQuery.eq('organization_id', orgId)
          unpaidQuery = unpaidQuery.eq('organization_id', orgId)
          monthlyTotalQuery = monthlyTotalQuery.eq('organization_id', orgId)
          monthlyRevenueRowsQuery = monthlyRevenueRowsQuery.eq('organization_id', orgId)
        }

        const [
          totalRes,
          confirmedRes,
          pendingRes,
          cancelledRes,
          unpaidRes,
          monthlyTotalRes,
          monthlyRevenueRes,
        ] = await Promise.all([
          totalQuery,
          confirmedQuery,
          pendingQuery,
          cancelledQuery,
          unpaidQuery,
          monthlyTotalQuery,
          monthlyRevenueRowsQuery,
        ])

        if (totalRes.error) throw totalRes.error
        if (confirmedRes.error) throw confirmedRes.error
        if (pendingRes.error) throw pendingRes.error
        if (cancelledRes.error) throw cancelledRes.error
        if (unpaidRes.error) throw unpaidRes.error
        if (monthlyTotalRes.error) throw monthlyTotalRes.error
        if (monthlyRevenueRes.error) throw monthlyRevenueRes.error

        if (!isMounted) return

        const monthlyRevenue = (monthlyRevenueRes.data ?? []).reduce((sum, curr) => {
          if (curr.status !== 'cancelled') {
            const price = curr.final_price || curr.total_price || 0
            return sum + price
          }
          return sum
        }, 0)

        const newStats: ReservationStats = {
          total: totalRes.count ?? 0,
          confirmed: confirmedRes.count ?? 0,
          pending: pendingRes.count ?? 0,
          cancelled: cancelledRes.count ?? 0,
          unpaid: unpaidRes.count ?? 0,
          monthlyTotal: monthlyTotalRes.count ?? 0,
          monthlyRevenue,
        }

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


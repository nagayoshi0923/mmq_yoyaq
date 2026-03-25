import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { getCurrentOrganizationId } from '@/lib/organization'
import { logger } from '@/utils/logger'

export interface AnnualData {
  year: number
  totalRevenue: number
  totalEvents: number
  monthlyRevenue: number[]
  monthlyEvents: number[]
  growthRate: number | null
}

interface UseAnnualAnalysisResult {
  annualData: AnnualData[]
  loading: boolean
  error: string | null
}

interface EventRow {
  id: string
  date: string
  category: string
  venue_rental_fee: number | null
}

interface ReservationRow {
  schedule_event_id: string
  final_price: number | null
  payment_method: string | null
}

export function useAnnualAnalysis(
  storeIds: string[] = [],
  startYear = 2022
): UseAnnualAnalysisResult {
  const [annualData, setAnnualData] = useState<AnnualData[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchData = useCallback(async () => {
    setLoading(true)
    setError(null)

    try {
      const orgId = await getCurrentOrganizationId()
      const currentYear = new Date().getFullYear()
      const startDate = `${startYear}-01-01`
      const endDate = `${currentYear}-12-31`

      // schedule_events をページネーション付きで取得
      const allEvents: EventRow[] = []
      const pageSize = 1000
      let from = 0
      while (true) {
        let q = supabase
          .from('schedule_events')
          .select('id, date, category, venue_rental_fee')
          .gte('date', startDate)
          .lte('date', endDate)
          .eq('is_cancelled', false)
          .order('date')
          .range(from, from + pageSize - 1)

        if (orgId) q = q.eq('organization_id', orgId)
        if (storeIds.length > 0) q = q.in('store_id', storeIds)

        const { data, error: qErr } = await q
        if (qErr) throw qErr
        if (!data || data.length === 0) break
        allEvents.push(...(data as EventRow[]))
        if (data.length < pageSize) break
        from += pageSize
      }

      // reservations を一括取得（バッチ分割）
      const eventIds = allEvents.map(e => e.id)
      const allReservations: ReservationRow[] = []
      const batchSize = 500
      for (let i = 0; i < eventIds.length; i += batchSize) {
        const batch = eventIds.slice(i, i + batchSize)
        let rFrom = 0
        while (true) {
          let rq = supabase
            .from('reservations')
            .select('schedule_event_id, final_price, payment_method')
            .in('schedule_event_id', batch)
            .in('status', ['confirmed', 'pending'])
            .range(rFrom, rFrom + pageSize - 1)

          if (orgId) rq = rq.eq('organization_id', orgId)

          const { data: rData, error: rErr } = await rq
          if (rErr) throw rErr
          if (!rData || rData.length === 0) break
          allReservations.push(...(rData as ReservationRow[]))
          if (rData.length < pageSize) break
          rFrom += pageSize
        }
      }

      // イベントごとの売上を集計（スタッフ予約を除外）
      const revenueByEvent = new Map<string, number>()
      allReservations.forEach(r => {
        if (r.payment_method === 'staff') return
        const prev = revenueByEvent.get(r.schedule_event_id) || 0
        revenueByEvent.set(r.schedule_event_id, prev + (r.final_price || 0))
      })

      // 年月別に集計
      const yearMap = new Map<number, { revenue: number; events: number; monthly: number[]; monthlyEvents: number[] }>()
      for (let y = startYear; y <= currentYear; y++) {
        yearMap.set(y, { revenue: 0, events: 0, monthly: new Array(12).fill(0), monthlyEvents: new Array(12).fill(0) })
      }

      allEvents.forEach(event => {
        const year = parseInt(event.date.substring(0, 4))
        const month = parseInt(event.date.substring(5, 7)) - 1
        const entry = yearMap.get(year)
        if (!entry) return

        let revenue = 0
        if (event.category === 'venue_rental') {
          revenue = event.venue_rental_fee || 12000
        } else if (event.category === 'venue_rental_free') {
          revenue = 0
        } else {
          revenue = revenueByEvent.get(event.id) || 0
        }

        entry.revenue += revenue
        entry.events += 1
        entry.monthly[month] += revenue
        entry.monthlyEvents[month] += 1
      })

      const result: AnnualData[] = []
      let prevRevenue: number | null = null

      for (let y = startYear; y <= currentYear; y++) {
        const entry = yearMap.get(y)!
        const growthRate = prevRevenue !== null && prevRevenue > 0
          ? ((entry.revenue - prevRevenue) / prevRevenue) * 100
          : null
        result.push({
          year: y,
          totalRevenue: entry.revenue,
          totalEvents: entry.events,
          monthlyRevenue: entry.monthly,
          monthlyEvents: entry.monthlyEvents,
          growthRate,
        })
        prevRevenue = entry.revenue
      }

      setAnnualData(result)
    } catch (err: any) {
      logger.error('年間分析データ取得エラー:', err)
      setError(err.message || '不明なエラー')
    } finally {
      setLoading(false)
    }
  }, [storeIds.join(','), startYear])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  return { annualData, loading, error }
}

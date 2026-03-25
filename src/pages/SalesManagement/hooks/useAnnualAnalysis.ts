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

      let query = supabase
        .from('schedule_events')
        .select('date, total_revenue, store_id, category')
        .gte('date', startDate)
        .lte('date', endDate)
        .eq('is_cancelled', false)
        .not('category', 'in', '(offsite,mtg,venue_rental,venue_rental_free)')

      if (orgId) {
        query = query.eq('organization_id', orgId)
      }

      if (storeIds.length > 0) {
        query = query.in('store_id', storeIds)
      }

      const { data: events, error: queryError } = await query.order('date')

      if (queryError) throw queryError

      const yearMap = new Map<number, { revenue: number; events: number; monthly: number[]; monthlyEvents: number[] }>()

      for (let y = startYear; y <= currentYear; y++) {
        yearMap.set(y, { revenue: 0, events: 0, monthly: new Array(12).fill(0), monthlyEvents: new Array(12).fill(0) })
      }

      events?.forEach(event => {
        const year = parseInt(event.date.substring(0, 4))
        const month = parseInt(event.date.substring(5, 7)) - 1
        const revenue = event.total_revenue || 0
        const entry = yearMap.get(year)
        if (entry) {
          entry.revenue += revenue
          entry.events += 1
          entry.monthly[month] += revenue
          entry.monthlyEvents[month] += 1
        }
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

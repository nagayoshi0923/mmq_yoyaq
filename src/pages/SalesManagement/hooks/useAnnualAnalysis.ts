import { useState, useEffect, useCallback } from 'react'
import { salesApi } from '@/lib/api/salesApi'
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
      const result = await salesApi.getAnnualAnalysis(storeIds, startYear)
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

/**
 * ライセンス報告を取得するフック（ライセンス管理組織用）
 */
import { useState, useEffect, useCallback } from 'react'
import { getAllExternalReports, getLicensePerformanceSummary } from '@/lib/api/externalReportsApi'
import type { ExternalPerformanceReport, LicensePerformanceSummary } from '@/types'

export function useLicenseReports(statusFilter: 'all' | 'pending' | 'approved' | 'rejected' = 'all') {
  const [reports, setReports] = useState<ExternalPerformanceReport[]>([])
  const [summary, setSummary] = useState<LicensePerformanceSummary[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  const fetchData = useCallback(async () => {
    try {
      setIsLoading(true)
      setError(null)
      
      // 並列で取得
      const [reportsData, summaryData] = await Promise.all([
        getAllExternalReports(statusFilter === 'all' ? undefined : { status: statusFilter }),
        getLicensePerformanceSummary(),
      ])
      
      setReports(reportsData)
      setSummary(summaryData)
    } catch (err) {
      console.error('Failed to fetch license reports:', err)
      setError(err instanceof Error ? err : new Error('Unknown error'))
    } finally {
      setIsLoading(false)
    }
  }, [statusFilter])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  return {
    reports,
    summary,
    isLoading,
    error,
    refetch: fetchData,
  }
}


/**
 * 外部公演報告を取得するフック
 */
import { useState, useEffect, useCallback } from 'react'
import { getMyExternalReports } from '@/lib/api/externalReportsApi'
import type { ExternalPerformanceReport } from '@/types'

export function useExternalReports() {
  const [reports, setReports] = useState<ExternalPerformanceReport[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  const fetchReports = useCallback(async () => {
    try {
      setIsLoading(true)
      setError(null)
      const data = await getMyExternalReports()
      setReports(data)
    } catch (err) {
      console.error('Failed to fetch external reports:', err)
      setError(err instanceof Error ? err : new Error('Unknown error'))
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchReports()
  }, [fetchReports])

  return {
    reports,
    isLoading,
    error,
    refetch: fetchReports,
  }
}


/**
 * 外部公演報告を取得するフック
 */
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { getMyExternalReports } from '@/lib/api/externalReportsApi'
import type { ExternalPerformanceReport } from '@/types'

export const externalReportKeys = {
  all: ['external-reports'] as const,
}

export function useExternalReports() {
  const queryClient = useQueryClient()

  const { data: reports = [], isLoading, error } = useQuery<ExternalPerformanceReport[], Error>({
    queryKey: externalReportKeys.all,
    queryFn: getMyExternalReports,
  })

  const refetch = () => queryClient.invalidateQueries({ queryKey: externalReportKeys.all })

  return {
    reports,
    isLoading,
    error: error ?? null,
    refetch,
  }
}

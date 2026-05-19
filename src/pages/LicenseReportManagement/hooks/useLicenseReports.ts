/**
 * ライセンス報告を取得するフック（ライセンス管理組織用）
 */
import { useQuery } from '@tanstack/react-query'
import { getAllExternalReports, getLicensePerformanceSummary } from '@/lib/api/externalReportsApi'
import type { ExternalPerformanceReport, LicensePerformanceSummary } from '@/types'

export function useLicenseReports(statusFilter: 'all' | 'pending' | 'approved' | 'rejected' = 'all') {
  const query = useQuery({
    queryKey: ['license-reports', statusFilter],
    queryFn: async () => {
      const [reports, summary] = await Promise.all([
        getAllExternalReports(statusFilter === 'all' ? undefined : { status: statusFilter }),
        getLicensePerformanceSummary(),
      ])
      return { reports, summary }
    },
  })

  return {
    reports: (query.data?.reports ?? []) as ExternalPerformanceReport[],
    summary: (query.data?.summary ?? []) as LicensePerformanceSummary[],
    isLoading: query.isLoading,
    error: query.error as Error | null,
    refetch: query.refetch,
  }
}

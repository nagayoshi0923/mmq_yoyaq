/**
 * 外部公演報告 API
 *
 * バックエンド API (/api/external-reports) 経由で
 * 全 read/write を実行する。マルチテナント境界は API 側で強制される。
 */
import { logger } from '@/utils/logger'
import { apiClient, ApiClientError } from '@/lib/apiClient'
import type { ExternalPerformanceReport, LicensePerformanceSummary } from '@/types'

/**
 * 外部公演報告を作成
 * - organization_id はサーバ側で JWT から取得され、リクエストボディの値は無視される
 */
export async function createExternalReport(
  report: Omit<
    ExternalPerformanceReport,
    'id' | 'status' | 'reviewed_by' | 'reviewed_at' | 'rejection_reason' | 'created_at' | 'updated_at'
  >
): Promise<ExternalPerformanceReport | null> {
  try {
    return await apiClient.post<ExternalPerformanceReport>('/api/external-reports', {
      scenario_master_id: report.scenario_master_id,
      // organization_id はサーバ側で強制されるため送信不要だが互換のため残す
      reported_by: report.reported_by,
      performance_date: report.performance_date,
      performance_count: report.performance_count,
      participant_count: report.participant_count,
      venue_name: report.venue_name,
      notes: report.notes,
    })
  } catch (error) {
    logger.error('Failed to create external report:', error)
    throw error
  }
}

/**
 * 外部公演報告一覧を取得（自組織の報告）
 */
export async function getMyExternalReports(): Promise<ExternalPerformanceReport[]> {
  try {
    return await apiClient.get<ExternalPerformanceReport[]>('/api/external-reports?type=mine')
  } catch (error) {
    logger.error('Failed to fetch external reports:', error)
    throw error
  }
}

/**
 * 全ての外部公演報告を取得（ライセンス管理組織用）
 *
 * - license_admin は全組織を閲覧可能（organizationId 指定可）
 * - その他のスタッフは自組織のみ（organizationId 指定は無視される）
 */
export async function getAllExternalReports(filters?: {
  status?: 'pending' | 'approved' | 'rejected'
  startDate?: string
  endDate?: string
  scenarioId?: string
  organizationId?: string
}): Promise<ExternalPerformanceReport[]> {
  try {
    const params = new URLSearchParams({ type: 'all' })
    if (filters?.status) params.set('status', filters.status)
    if (filters?.startDate) params.set('startDate', filters.startDate)
    if (filters?.endDate) params.set('endDate', filters.endDate)
    if (filters?.scenarioId) params.set('scenarioId', filters.scenarioId)
    if (filters?.organizationId) params.set('organizationId', filters.organizationId)
    return await apiClient.get<ExternalPerformanceReport[]>(`/api/external-reports?${params.toString()}`)
  } catch (error) {
    logger.error('Failed to fetch all external reports:', error)
    throw error
  }
}

/**
 * 外部公演報告を承認（license_admin のみ）
 */
export async function approveExternalReport(
  reportId: string,
  reviewerId: string
): Promise<ExternalPerformanceReport | null> {
  try {
    const params = new URLSearchParams({ id: reportId, action: 'approve' })
    return await apiClient.patch<ExternalPerformanceReport>(
      `/api/external-reports?${params.toString()}`,
      { reviewerId }
    )
  } catch (error) {
    logger.error('Failed to approve external report:', error)
    throw error
  }
}

/**
 * 外部公演報告を却下（license_admin のみ）
 */
export async function rejectExternalReport(
  reportId: string,
  reviewerId: string,
  reason: string
): Promise<ExternalPerformanceReport | null> {
  try {
    const params = new URLSearchParams({ id: reportId, action: 'reject' })
    return await apiClient.patch<ExternalPerformanceReport>(
      `/api/external-reports?${params.toString()}`,
      { reviewerId, reason }
    )
  } catch (error) {
    logger.error('Failed to reject external report:', error)
    throw error
  }
}

/**
 * 外部公演報告を更新（pending 状態のみ）
 */
export async function updateExternalReport(
  reportId: string,
  updates: Partial<
    Pick<
      ExternalPerformanceReport,
      'performance_date' | 'performance_count' | 'participant_count' | 'venue_name' | 'notes'
    >
  >
): Promise<ExternalPerformanceReport | null> {
  try {
    const params = new URLSearchParams({ id: reportId, action: 'update' })
    return await apiClient.patch<ExternalPerformanceReport>(
      `/api/external-reports?${params.toString()}`,
      updates
    )
  } catch (error) {
    logger.error('Failed to update external report:', error)
    throw error
  }
}

/**
 * 外部公演報告を削除（pending 状態のみ）
 */
export async function deleteExternalReport(reportId: string): Promise<boolean> {
  try {
    await apiClient.delete<{ success: boolean }>(
      `/api/external-reports?id=${encodeURIComponent(reportId)}`
    )
    return true
  } catch (error) {
    logger.error('Failed to delete external report:', error)
    throw error
  }
}

/**
 * ライセンス集計サマリーを取得（license_admin のみ）
 */
export async function getLicensePerformanceSummary(filters?: {
  startDate?: string
  endDate?: string
  authorName?: string
}): Promise<LicensePerformanceSummary[]> {
  try {
    const params = new URLSearchParams({ type: 'license-summary' })
    if (filters?.startDate) params.set('startDate', filters.startDate)
    if (filters?.endDate) params.set('endDate', filters.endDate)
    if (filters?.authorName) params.set('authorName', filters.authorName)
    return await apiClient.get<LicensePerformanceSummary[]>(
      `/api/external-reports?${params.toString()}`
    )
  } catch (error) {
    // license_admin 以外で 403 が返るケースは旧挙動でも空配列ではないため伝播
    if (error instanceof ApiClientError && error.status === 403) {
      logger.warn('License summary requires license_admin role')
      return []
    }
    logger.error('Failed to fetch license performance summary:', error)
    throw error
  }
}

/**
 * 管理シナリオ一覧を取得（報告フォーム用）
 * organization_scenarios_with_master を使用（組織固有の license_amount を含む）
 */
export async function getManagedScenarios(): Promise<
  Array<{ id: string; title: string; author: string; license_amount: number }>
> {
  try {
    return await apiClient.get<Array<{ id: string; title: string; author: string; license_amount: number }>>(
      '/api/external-reports?type=managed-scenarios'
    )
  } catch (error) {
    logger.error('Failed to fetch managed scenarios:', error)
    throw error
  }
}

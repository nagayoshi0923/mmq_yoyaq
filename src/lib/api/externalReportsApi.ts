/**
 * 外部公演報告 API
 */
import { logger } from '@/utils/logger'
import { supabase } from '@/lib/supabase'
import { getCurrentOrganizationId } from '@/lib/organization'
import type { ExternalPerformanceReport, LicensePerformanceSummary } from '@/types'

/**
 * 外部公演報告を作成
 */
export async function createExternalReport(
  report: Omit<ExternalPerformanceReport, 'id' | 'status' | 'reviewed_by' | 'reviewed_at' | 'rejection_reason' | 'created_at' | 'updated_at'>
): Promise<ExternalPerformanceReport | null> {
  const { data, error } = await supabase
    .from('external_performance_reports')
    .insert({
      scenario_id: report.scenario_id,
      organization_id: report.organization_id,
      reported_by: report.reported_by,
      performance_date: report.performance_date,
      performance_count: report.performance_count,
      participant_count: report.participant_count,
      venue_name: report.venue_name,
      notes: report.notes,
      status: 'pending',
    })
    .select()
    .single()

  if (error) {
    logger.error('Failed to create external report:', error)
    throw error
  }

  return data as ExternalPerformanceReport
}

/**
 * 外部公演報告一覧を取得（自組織の報告）
 */
export async function getMyExternalReports(): Promise<ExternalPerformanceReport[]> {
  const orgId = await getCurrentOrganizationId()
  
  let query = supabase
    .from('external_performance_reports')
    .select(`
      *,
      scenarios:scenario_id (id, title, author),
      reporter:reported_by (id, name),
      reviewer:reviewed_by (id, name)
    `)
    .order('created_at', { ascending: false })

  if (orgId) {
    query = query.eq('organization_id', orgId)
  }

  const { data, error } = await query

  if (error) {
    logger.error('Failed to fetch external reports:', error)
    throw error
  }

  return data as ExternalPerformanceReport[]
}

/**
 * 全ての外部公演報告を取得（ライセンス管理組織用）
 */
export async function getAllExternalReports(
  filters?: {
    status?: 'pending' | 'approved' | 'rejected'
    startDate?: string
    endDate?: string
    scenarioId?: string
    organizationId?: string
  }
): Promise<ExternalPerformanceReport[]> {
  let query = supabase
    .from('external_performance_reports')
    .select(`
      *,
      scenarios:scenario_id (id, title, author),
      organizations:organization_id (id, name, slug),
      reporter:reported_by (id, name),
      reviewer:reviewed_by (id, name)
    `)
    .order('created_at', { ascending: false })

  if (filters?.status) {
    query = query.eq('status', filters.status)
  }
  if (filters?.startDate) {
    query = query.gte('performance_date', filters.startDate)
  }
  if (filters?.endDate) {
    query = query.lte('performance_date', filters.endDate)
  }
  if (filters?.scenarioId) {
    query = query.eq('scenario_id', filters.scenarioId)
  }
  if (filters?.organizationId) {
    query = query.eq('organization_id', filters.organizationId)
  }

  const { data, error } = await query

  if (error) {
    logger.error('Failed to fetch all external reports:', error)
    throw error
  }

  return data as ExternalPerformanceReport[]
}

/**
 * 外部公演報告を承認
 */
export async function approveExternalReport(
  reportId: string,
  reviewerId: string
): Promise<ExternalPerformanceReport | null> {
  const { data, error } = await supabase
    .from('external_performance_reports')
    .update({
      status: 'approved',
      reviewed_by: reviewerId,
      reviewed_at: new Date().toISOString(),
      rejection_reason: null,
    })
    .eq('id', reportId)
    .select()
    .single()

  if (error) {
    logger.error('Failed to approve external report:', error)
    throw error
  }

  return data as ExternalPerformanceReport
}

/**
 * 外部公演報告を却下
 */
export async function rejectExternalReport(
  reportId: string,
  reviewerId: string,
  reason: string
): Promise<ExternalPerformanceReport | null> {
  const { data, error } = await supabase
    .from('external_performance_reports')
    .update({
      status: 'rejected',
      reviewed_by: reviewerId,
      reviewed_at: new Date().toISOString(),
      rejection_reason: reason,
    })
    .eq('id', reportId)
    .select()
    .single()

  if (error) {
    logger.error('Failed to reject external report:', error)
    throw error
  }

  return data as ExternalPerformanceReport
}

/**
 * 外部公演報告を更新（pending 状態のみ）
 */
export async function updateExternalReport(
  reportId: string,
  updates: Partial<Pick<ExternalPerformanceReport, 'performance_date' | 'performance_count' | 'participant_count' | 'venue_name' | 'notes'>>
): Promise<ExternalPerformanceReport | null> {
  const { data, error } = await supabase
    .from('external_performance_reports')
    .update(updates)
    .eq('id', reportId)
    .eq('status', 'pending')  // pending のみ更新可能
    .select()
    .single()

  if (error) {
    logger.error('Failed to update external report:', error)
    throw error
  }

  return data as ExternalPerformanceReport
}

/**
 * 外部公演報告を削除（pending 状態のみ）
 */
export async function deleteExternalReport(reportId: string): Promise<boolean> {
  const { error } = await supabase
    .from('external_performance_reports')
    .delete()
    .eq('id', reportId)
    .eq('status', 'pending')  // pending のみ削除可能

  if (error) {
    logger.error('Failed to delete external report:', error)
    throw error
  }

  return true
}

/**
 * ライセンス集計サマリーを取得
 */
export async function getLicensePerformanceSummary(
  filters?: {
    startDate?: string
    endDate?: string
    authorName?: string
  }
): Promise<LicensePerformanceSummary[]> {
  // ビューから取得
  const { data, error } = await supabase
    .from('license_performance_summary')
    .select('*')

  if (error) {
    logger.error('Failed to fetch license performance summary:', error)
    throw error
  }

  let result = data as LicensePerformanceSummary[]

  // フィルター適用（クライアント側）
  if (filters?.authorName) {
    result = result.filter(r => r.author === filters.authorName)
  }

  return result
}

/**
 * 管理シナリオ一覧を取得（報告フォーム用）
 */
export async function getManagedScenarios(): Promise<Array<{ id: string; title: string; author: string; license_amount: number }>> {
  const { data, error } = await supabase
    .from('scenarios')
    .select('id, title, author, license_amount')
    .eq('scenario_type', 'managed')
    .eq('status', 'available')
    .order('title')

  if (error) {
    logger.error('Failed to fetch managed scenarios:', error)
    throw error
  }

  return data || []
}


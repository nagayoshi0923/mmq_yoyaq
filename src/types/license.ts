import type { Organization } from './organization'
import type { Scenario } from './scenario'
import type { Staff } from './staff'

export interface ExternalPerformanceReport {
  id: string
  scenario_master_id: string
  organization_id: string
  reported_by: string  // staff.id
  performance_date: string
  performance_count: number
  participant_count?: number | null
  venue_name?: string | null
  notes?: string | null
  status: 'pending' | 'approved' | 'rejected'
  reviewed_by?: string | null  // staff.id
  reviewed_at?: string | null
  rejection_reason?: string | null
  created_at: string
  updated_at: string
  // 拡張フィールド（join時に取得）
  scenarios?: Scenario | null
  organizations?: Organization | null
  reporter?: Staff | null
  reviewer?: Staff | null
}

// ライセンス集計サマリーの型定義
export interface LicensePerformanceSummary {
  scenario_master_id: string
  scenario_title: string
  author: string
  license_amount: number
  internal_performance_count: number
  external_performance_count: number
  total_performance_count: number
  total_license_fee: number
}

export type LicenseManagerType =
  | 'qw_managed'
  | 'external_rights_holder'
  | 'buyout'
  | 'in_house'

export type LicenseBillingStatus =
  | 'billable'
  | 'not_billable'
  | 'exempt'
  | 'pending_confirmation'

export interface StoreScenarioLicenseContract {
  id: string
  organization_id: string
  store_id: string
  scenario_master_id: string
  license_manager_type: LicenseManagerType
  standard_license_amount: number
  contracted_count: number
  contract_start_date: string | null
  contract_end_date: string | null
  billing_status: LicenseBillingStatus
  notes: string | null
  created_at: string
  updated_at: string
  stores?: {
    id: string
    name: string
    short_name: string
  } | null
  scenario_masters?: {
    id: string
    title: string
    author: string | null
  } | null
}

export interface StoreScenarioLicenseContractOptions {
  stores: Array<{
    id: string
    name: string
    short_name: string
  }>
  scenarios: Array<{
    id: string
    title: string
    author: string | null
    license_amount: number | null
  }>
}

export interface LicenseContractInput {
  store_id: string
  scenario_master_id: string
  license_manager_type: LicenseManagerType
  standard_license_amount: number
  contracted_count: number
  contract_start_date?: string | null
  contract_end_date?: string | null
  billing_status: LicenseBillingStatus
  notes?: string | null
}

// ================================================
// 作者ポータル関連の型定義（メールアドレスベース）
// ================================================

// 作者の型定義（旧形式互換）
export interface Author {
  id: string
  name: string
  email?: string | null
  notes?: string | null
  license_organization_name?: string | null
  last_email_sent_ym?: string | null  // "YYYY-MM" 形式。notesのJSONに __sent_ym__ として保存
  created_at: string
  updated_at: string
}

// 作者向け公演報告ビューの型定義（メールアドレスベース）
export interface AuthorPerformanceReport {
  author_email: string
  author_name: string
  scenario_master_id: string
  scenario_title: string
  organization_id: string
  organization_name: string
  report_id: string
  performance_date: string
  performance_count: number
  participant_count?: number | null
  venue_name?: string | null
  report_status: 'pending' | 'approved' | 'rejected'
  reported_at: string
  license_amount: number
  calculated_license_fee: number
}

// 作者ダッシュボード集計の型定義（メールアドレスベース）
export interface AuthorSummary {
  author_email: string
  total_scenarios: number
  total_approved_reports: number
  total_performance_count: number
  total_license_fee: number
  organizations_count: number
}

// ================================================
// 店舗関連の型定義
// ================================================

// 店舗固定費の型定義

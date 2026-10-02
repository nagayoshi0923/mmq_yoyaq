/**
 * 収支の台帳（雑収入・経費・制作費・外部売上）の書き込みAPI
 *
 * 画面から supabase.from() を直接呼ばず、ここを通す（整備 Phase 2、お金に関わる書き込みの集約）。
 * 挙動は移行前と同じ。戻り値は supabase の { error } をそのまま返す（呼び出し側の扱いを変えない）。
 */
import { supabase } from '@/lib/supabase'

export const miscTransactionApi = {
  /** 雑収入・経費・制作費・収支調整を1件追加する */
  async create(row: Record<string, unknown>) {
    return supabase.from('miscellaneous_transactions').insert([row])
  },
  async update(id: string, row: Record<string, unknown>) {
    return supabase.from('miscellaneous_transactions').update(row).eq('id', id)
  },
  async delete(id: string) {
    return supabase.from('miscellaneous_transactions').delete().eq('id', id)
  },
}

export const externalSalesApi = {
  async create(row: Record<string, unknown>) {
    return supabase.from('external_sales').insert([row])
  },
  async update(id: string, row: Record<string, unknown>) {
    return supabase.from('external_sales').update(row).eq('id', id)
  },
  async delete(id: string) {
    return supabase.from('external_sales').delete().eq('id', id)
  },
}

/** 給与（報酬）設定の書き込み。現在値 → 履歴 の順に呼ぶ（失敗時の案内が違うため呼び出し側が順序とエラーを扱う） */
export interface SalarySettingsValues {
  gm_base_pay: number
  gm_hourly_rate: number
  gm_test_base_pay: number
  gm_test_hourly_rate: number
  reception_fixed_pay: number
  use_hourly_table: boolean
  hourly_rates: unknown
  gm_test_hourly_rates: unknown
}
export const salarySettingsApi = {
  /** 現在の設定（global_settings）を更新する */
  async updateCurrent(settingsId: string, organizationId: string, values: SalarySettingsValues) {
    return supabase.from('global_settings').update(values).eq('id', settingsId).eq('organization_id', organizationId)
  },
  /** 給与計算用の履歴（有効開始日ごと）を保存する。同じ日の再保存は上書き */
  async saveHistory(organizationId: string, effectiveFrom: string, values: SalarySettingsValues) {
    return supabase.from('salary_settings_history')
      .upsert({ organization_id: organizationId, effective_from: effectiveFrom, ...values }, { onConflict: 'organization_id,effective_from' })
  },
}

/** ライセンス（作者）への月次報告の送信履歴 */
export interface LicenseReportHistoryRow {
  organization_id: string
  author_name: string
  author_email: string | null
  year: number
  month: number
  total_events: number
  total_license_cost: number
  email_body: string
  subject: string
  scenarios: Array<{ title: string; events: number; licenseCost: number }>
}
export const licenseReportHistoryApi = {
  /** 送信履歴を保存（同じ組織・作者・年月は上書き） */
  async save(row: LicenseReportHistoryRow) {
    return supabase.from('license_report_history').upsert(row, { onConflict: 'organization_id,author_name,year,month' })
  },
  /** 送信後にメール本文・件名だけを編集して更新する */
  async updateBody(organizationId: string, authorName: string, year: number, month: number, body: { email_body: string; subject: string }) {
    return supabase.from('license_report_history').update(body)
      .eq('organization_id', organizationId).eq('author_name', authorName).eq('year', year).eq('month', month)
  },
}

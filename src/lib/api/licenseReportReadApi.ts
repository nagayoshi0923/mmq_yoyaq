/**
 * ライセンス報告（送信画面・外部作者の報告フォーム）の読み取り・RPC の API
 *
 * 画面・フックから supabase を直接呼ばず、ここを通す（整備 Phase 2、#773）。
 * 絞り込み条件・select の列・戻り値（{ data, error }）は元の呼び出しのまま。
 */
import { supabase } from '@/lib/supabase'

export const licenseReportReadApi = {
  /** 年月の送信履歴 */
  async listReportHistory(year: number, month: number) {
    return supabase
      .from('license_report_history')
      .select('author_name, sent_at, total_events, total_license_cost, email_body, subject')
      .eq('year', year)
      .eq('month', month)
  },

  /** 年月の手動入力の他社公演数 */
  async listManualExternalPerformances(year: number, month: number) {
    return supabase
      .from('manual_external_performances')
      .select('scenario_id, performance_count, performance_type')
      // org 境界は RLS（get_user_organization_id）に任せる。クライアント直フィルタは増やさない
      .eq('year', year)
      .eq('month', month)
  },

  /** 年月の自社公演数の手動上書き */
  async listManualInternalOverrides(organizationId: string, year: number, month: number) {
    return supabase
      .from('manual_internal_performance_overrides')
      .select('scenario_key, performance_count')
      .eq('organization_id', organizationId)
      .eq('year', year)
      .eq('month', month)
  },

  /** 外部作者の月次報告フォームの内容（RPC） */
  async getPartnerReportForm(token: string, year: number, month: number) {
    return supabase.rpc('get_license_partner_report_form', {
        p_token: token,
        p_year: year,
        p_month: month,
      })
  },
}

export const licenseReportRpcApi = {
  /** 手動入力の他社公演数を保存する（RPC） */
  async upsertManualExternalPerformance(args: Record<string, unknown>) {
    return supabase.rpc('upsert_manual_external_performance', args)
  },
  /** 自社公演数の手動上書きを保存する（RPC） */
  async upsertManualInternalPerformanceOverride(args: Record<string, unknown>) {
    return supabase.rpc('upsert_manual_internal_performance_override', args)
  },
  /** 外部作者の月次報告を提出する（RPC） */
  async submitPartnerMonthlyReport(args: Record<string, unknown>) {
    return supabase.rpc('submit_license_partner_monthly_report', args)
  },
}

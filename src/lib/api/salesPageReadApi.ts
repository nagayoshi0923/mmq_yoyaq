/**
 * 売上管理画面（外部売上・雑収支・制作費）の読み取りAPI
 *
 * 画面・フックから supabase を直接呼ばず、ここを通す（整備 Phase 2、#773）。
 * 絞り込み条件・select の列・戻り値（{ data, error }）は元の呼び出しのまま。
 */
import { supabase } from '@/lib/supabase'

export const salesPageReadApi = {
  /** 組織のシナリオ（フランチャイズのライセンス料つき） */
  async listScenariosWithFranchiseLicense(organizationId: string) {
    return supabase
      .from('organization_scenarios_with_master')
      .select('id, title, franchise_license_amount, franchise_gm_test_license_amount, organization_id')
      .eq('organization_id', organizationId)
      .order('title')
  },

  /** 期間内の外部売上（新しい順） */
  async listExternalSales(startDate: string, endDate: string) {
    return supabase
      .from('external_sales')
      .select('id, organization_id, type, date, scenario_id, store_name, amount, license_cost, notes, created_at, updated_at')
      .gte('date', startDate)
      .lte('date', endDate)
      .order('date', { ascending: false })
  },

  /** 組織のシナリオ（id・題名・作者。題名順） */
  async listScenarioOptions(organizationId: string) {
    return supabase
      .from('organization_scenarios_with_master')
      .select('id, title, author')
      .eq('organization_id', organizationId)
      .order('title', { ascending: true })
  },

  /** 期間内の雑収支（新しい順） */
  async listMiscellaneousTransactions(startDate: string, endDate: string) {
    return supabase
      .from('miscellaneous_transactions')
      .select('id, organization_id, store_id, scenario_id, date, type, category, amount, description, created_at')
      .gte('date', startDate)
      .lte('date', endDate)
      .order('date', { ascending: false })
  },
}

export const productionCostReadApi = {
  /** 組織のシナリオ（id・題名・作者）を題名順 */
  async listScenarios(organizationId: string) {
    // organization_id でフィルタ（マルチテナント対応）
    return supabase
      .from('organization_scenarios_with_master')
      .select('id, title, author')
      .eq('organization_id', organizationId)
      .order('title', { ascending: true })
  },
}


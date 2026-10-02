/**
 * 外部公演・貸出の報告フォームの読み取りAPI
 *
 * 画面・フックから supabase を直接呼ばず、ここを通す（整備 Phase 2、#773）。
 * 絞り込み条件・select の列・戻り値（{ data, error }）は元の呼び出しのまま。
 */
import { supabase } from '@/lib/supabase'

export const reportFormReadApi = {
  /** 管理シナリオ（公開中）。作者・題名順 */
  async listManagedAvailableScenarios() {
    return supabase
      .from('organization_scenarios_with_master')
      .select('id, title, author, license_amount')
      .eq('scenario_type', 'managed')
      .eq('status', 'available')
      .order('author')
      .order('title')
  },

  /** 組織の管理シナリオ（公開中）。作者・題名順 */
  async listManagedAvailableScenariosOfOrganization(organizationId: string) {
    return supabase
      .from('organization_scenarios_with_master')
      .select('id, org_scenario_id, scenario_master_id, title, author')
      .eq('organization_id', organizationId)
      .eq('scenario_type', 'managed')
      .eq('status', 'available')
      .order('author')
      .order('title')
  },

  /** 組織のシナリオの外部ライセンス料 */
  async listExternalLicenseAmounts(orgScenarioIds: string[]) {
    return supabase
      .from('organization_scenarios')
      .select('id, external_license_amount')
      .in('id', orgScenarioIds)
  },
}

import { supabase } from '@/lib/supabase'

/** マスター（全組織を見られる人）用: 本部とフランチャイズの組織の切り替え（2026-10-06） */
export interface MasterOrganization { id: string; name: string; slug: string; is_current: boolean }

export const platformMasterApi = {
  /** マスターか（マスター以外は false。失敗したときも false） */
  async isMaster(): Promise<boolean> {
    const { data, error } = await supabase.rpc('is_platform_master')
    return !error && data === true
  },
  /** 切り替えられる組織の一覧（マスター以外は拒否される） */
  async listOrganizations() {
    return supabase.rpc('platform_master_organizations')
  },
  /** 組織を切り替える。切り替え先の住所（slug）を返す */
  async switchOrganization(organizationId: string) {
    return supabase.rpc('platform_master_switch_organization', { p_organization_id: organizationId })
  },
}

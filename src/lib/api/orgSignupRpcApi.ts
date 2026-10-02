/**
 * 組織の新規登録（OrgSignup）の RPC API
 *
 * 画面から supabase.rpc() を直接呼ばず、ここを通す（整備 Phase 2、#773）。
 * 権限・組織境界は DB 側の RPC が確認する。引数の組み立ては呼び出し側のまま。戻り値は { data, error } のまま。
 */
import { supabase } from '@/lib/supabase'

export const orgSignupRpcApi = {
  /** 組織と最初の店舗を登録する（管理者の紐付けは別の RPC） */
  async registerOrganization(args: Record<string, unknown>) {
    return supabase.rpc('register_organization_for_signup', args)
  },
  /** 登録した組織を管理者として申請する */
  async claimAsAdmin(args: Record<string, unknown>) {
    return supabase.rpc('claim_organization_as_admin_v2', args)
  },
  /** 管理者の紐付けに失敗した組織を巻き戻す */
  async rollbackOrphan(organizationId: string, claimToken: string) {
    return supabase.rpc('rollback_orphan_organization_v2', { p_org_id: organizationId, p_claim_token: claimToken })
  },
}

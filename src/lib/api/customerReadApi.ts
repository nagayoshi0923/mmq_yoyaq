/**
 * 顧客の読み取りAPI（画面・部品から supabase.from('customers') を直接呼ばず、ここを通す。整備 Phase 2、#773）
 * 絞り込み条件・select の列・戻り値（{ data, error }）は元の呼び出しのまま。
 */
import { supabase } from '@/lib/supabase'

export const customerReadApi = {
  /** コマンドパレット: 名前・メール・電話の部分一致で最大5件（pattern は % 付き） */
  async searchForPalette(organizationId: string, pattern: string) {
    return supabase
      .from('customers')
      .select('id, name, email, phone')
      .eq('organization_id', organizationId)
      .or(`name.ilike.${pattern},email.ilike.${pattern},phone.ilike.${pattern}`)
      .limit(5)
  },
  /** デモ顧客（名前に「デモ」かメールに demo）を1件。組織が分かれば絞る */
  async findDemoCustomer(organizationId?: string) {
    let query = supabase
      .from('customers')
      .select('id')
      .or('name.ilike.%デモ%,email.ilike.%demo%')
    if (organizationId) {
      query = query.eq('organization_id', organizationId)
    }
    return query.limit(1).single()
  },
  /** 参加者名で顧客を1件探す。自組織か組織なし（プラットフォーム顧客）を許容する */
  async findByNameForParticipation(name: string, organizationId?: string) {
    let query = supabase
      .from('customers')
      .select('id, name, email, phone')
      .eq('name', name)
    if (organizationId) {
      query = query.or(`organization_id.eq.${organizationId},organization_id.is.null`)
    }
    return query.limit(1).maybeSingle()
  },
  /** 名前の候補用: 名前が空でない顧客の名前 */
  async listNames() {
    return supabase
      .from('customers')
      .select('name')
      .not('name', 'is', null)
      .not('name', 'eq', '')
  },
}

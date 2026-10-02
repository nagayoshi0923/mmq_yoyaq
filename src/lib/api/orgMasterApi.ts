/**
 * 組織ごとの作者・カテゴリの候補（organization_authors / organization_categories）の書き込みAPI
 *
 * シナリオ編集の部品から supabase.from() を直接呼ばず、ここを通す（整備 Phase 2）。
 * 同じ名前がすでにあれば何もしない（組織×名前で競合したら更新）。戻り値は supabase の { error } をそのまま返す。
 */
import { supabase } from '@/lib/supabase'

export const orgMasterApi = {
  async ensureAuthor(organizationId: string, name: string) {
    return supabase.from('organization_authors').upsert(
      { organization_id: organizationId, name, sort_order: 9999 },
      { onConflict: 'organization_id,name' }
    )
  },
  async ensureCategory(organizationId: string, name: string) {
    return supabase.from('organization_categories').upsert(
      { organization_id: organizationId, name, sort_order: 9999 },
      { onConflict: 'organization_id,name' }
    )
  },
}

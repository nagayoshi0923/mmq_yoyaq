/**
 * シナリオまわり（マスタ・キャラクター・修正リクエスト・組織のシナリオ・お気に入り・評価）の書き込みAPI
 *
 * 画面・部品・hook から supabase.from() を直接呼ばず、ここを通す（整備 Phase 2）。
 * 絞り込み条件・upsert キー・戻り値（{ data, error }）は元の呼び出しのまま。呼び出し側が error を見る。
 */
import { supabase } from '@/lib/supabase'

export const scenarioMasterWriteApi = {
  /** マスタを新規作成して返す */
  async createReturning(row: Record<string, unknown>) {
    return supabase.from('scenario_masters').insert(row).select().single()
  },
  async updateById(id: string, fields: Record<string, unknown>) {
    return supabase.from('scenario_masters').update(fields).eq('id', id)
  },
  /** 複数のマスタを同じ内容で更新する（状態の一括変更・作者メールの一括登録） */
  async updateByIds(ids: string[], fields: Record<string, unknown>) {
    return supabase.from('scenario_masters').update(fields).in('id', ids)
  },
}

export const scenarioCharacterApi = {
  async insert(row: Record<string, unknown>) {
    return supabase.from('scenario_characters').insert(row)
  },
  async updateById(id: string, fields: Record<string, unknown>) {
    return supabase.from('scenario_characters').update(fields).eq('id', id)
  },
  async deleteById(id: string) {
    return supabase.from('scenario_characters').delete().eq('id', id)
  },
}

export const scenarioMasterCorrectionApi = {
  async updateById(id: string, fields: Record<string, unknown>) {
    return supabase.from('scenario_master_corrections').update(fields).eq('id', id)
  },
}

export const organizationScenarioWriteApi = {
  /** 組織のシナリオを追加する（マスタから追加） */
  async insert(row: Record<string, unknown>) {
    return supabase.from('organization_scenarios').insert(row)
  },
  /** 組織のシナリオを追加して id を返す（シナリオ編集の保存） */
  async insertReturningId(row: Record<string, unknown>) {
    return supabase.from('organization_scenarios').insert(row).select('id').single()
  },
  /** id と組織で絞って更新する（他組織の行は更新しない） */
  async updateByIdInOrganization(id: string, organizationId: string, fields: Record<string, unknown>) {
    return supabase.from('organization_scenarios').update(fields).eq('id', id).eq('organization_id', organizationId)
  },
  /** id だけで絞って更新する（ジャンルの名前変更・削除の反映） */
  async updateById(id: string, fields: Record<string, unknown>) {
    return supabase.from('organization_scenarios').update(fields).eq('id', id)
  },
  /** 組織内で作者名が一致する行の作者を書き換える（null でクリア） */
  async replaceAuthorOverride(organizationId: string, oldName: string, newName: string | null) {
    return supabase.from('organization_scenarios').update({ override_author: newName })
      .eq('organization_id', organizationId).eq('override_author', oldName)
  },
}

export const scenarioLikeApi = {
  /** お気に入りから外す（scenario_master_id か scenario_id のどちらかが一致する行） */
  async removeByCustomerAndScenario(customerId: string, scenarioId: string) {
    return supabase.from('scenario_likes').delete()
      .eq('customer_id', customerId)
      .or(`scenario_master_id.eq.${scenarioId},scenario_id.eq.${scenarioId}`)
  },
  async add(row: Record<string, unknown>) {
    return supabase.from('scenario_likes').insert(row)
  },
  async removeById(id: string) {
    return supabase.from('scenario_likes').delete().eq('id', id)
  },
}

export const scenarioRatingApi = {
  async remove(customerId: string, scenarioMasterId: string) {
    return supabase.from('scenario_ratings').delete()
      .eq('customer_id', customerId).eq('scenario_master_id', scenarioMasterId)
  },
  async upsert(row: Record<string, unknown>) {
    return supabase.from('scenario_ratings').upsert(row, { onConflict: 'customer_id,scenario_master_id' })
  },
}

export type OrgMasterTable = 'organization_authors' | 'organization_categories'

/** 作者・カテゴリの一覧管理（設定画面）。表名は2つのどちらか。 */
export const orgMasterListApi = {
  async insertItem(table: OrgMasterTable, row: Record<string, unknown>) {
    return supabase.from(table).insert(row)
  },
  async updateItemById(table: OrgMasterTable, id: string, fields: Record<string, unknown>) {
    return supabase.from(table).update(fields).eq('id', id)
  },
  async deleteItemById(table: OrgMasterTable, id: string) {
    return supabase.from(table).delete().eq('id', id)
  },
}

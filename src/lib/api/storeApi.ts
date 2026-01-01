/**
 * 店舗関連API
 */
import { supabase } from '../supabase'
import { getCurrentOrganizationId } from '@/lib/organization'
import type { Store } from '@/types'

export const storeApi = {
  // 全店舗を取得
  // @param includeTemporary - 臨時会場を含めるかどうか（デフォルト: false）
  // @param organizationId - 指定した場合そのIDを使用、未指定の場合はログインユーザーの組織で自動フィルタ
  // @param skipOrgFilter - trueの場合、組織フィルタをスキップ（全組織のデータを取得）
  // @param excludeOffice - trueの場合、オフィス（ownership_type='office'）を除外（デフォルト: false）
  async getAll(includeTemporary: boolean = false, organizationId?: string, skipOrgFilter?: boolean, excludeOffice: boolean = false): Promise<Store[]> {
    let query = supabase.from('stores').select('*')
    
    // 組織フィルタリング
    if (!skipOrgFilter) {
      // organizationIdが指定されていない場合、現在のユーザーの組織を自動取得
      const orgId = organizationId || await getCurrentOrganizationId()
      if (orgId) {
        query = query.eq('organization_id', orgId)
      }
    }
    
    // 臨時会場を除外する場合
    if (!includeTemporary) {
      query = query.or('is_temporary.is.null,is_temporary.eq.false')
    }
    
    // オフィスを除外する場合
    if (excludeOffice) {
      query = query.neq('ownership_type', 'office')
    }
    
    const { data, error } = await query
    
    if (error) throw error
    
    // display_order順にソート（DBのカラムを使用）
    // 臨時会場は最後に配置
    const sortedData = (data || []).sort((a, b) => {
      // 臨時会場は最後に配置
      if (a.is_temporary && !b.is_temporary) return 1
      if (!a.is_temporary && b.is_temporary) return -1
      if (a.is_temporary && b.is_temporary) {
        // 臨時会場同士はdisplay_order順、なければ名前順
        const orderA = a.display_order ?? 999
        const orderB = b.display_order ?? 999
        if (orderA !== orderB) return orderA - orderB
        return a.name.localeCompare(b.name, 'ja')
      }
      
      // 通常の店舗同士はdisplay_order順
      const orderA = a.display_order ?? 999
      const orderB = b.display_order ?? 999
      if (orderA !== orderB) return orderA - orderB
      // 同じ順序の場合は名前順
      return a.name.localeCompare(b.name, 'ja')
    })
    
    return sortedData
  },

  // 店舗の表示順序を一括更新
  async updateDisplayOrder(storeOrders: { id: string; display_order: number }[]): Promise<void> {
    // 並列で更新
    const updates = storeOrders.map(({ id, display_order }) =>
      supabase.from('stores').update({ display_order }).eq('id', id)
    )
    
    const results = await Promise.all(updates)
    const errors = results.filter(r => r.error)
    if (errors.length > 0) {
      throw new Error('表示順序の更新に失敗しました')
    }
  },

  // 店舗を作成
  async create(store: Omit<Store, 'id' | 'created_at' | 'updated_at'>): Promise<Store> {
    // organization_idを自動取得（マルチテナント対応）
    const organizationId = await getCurrentOrganizationId()
    if (!organizationId) {
      throw new Error('組織情報が取得できません。再ログインしてください。')
    }
    
    const { data, error } = await supabase
      .from('stores')
      .insert([{ ...store, organization_id: organizationId }])
      .select()
      .single()
    
    if (error) throw error
    return data
  },

  // 店舗を更新
  async update(id: string, updates: Partial<Store>): Promise<Store> {
    const { data, error } = await supabase
      .from('stores')
      .update(updates)
      .eq('id', id)
      .select()
      .single()
    
    if (error) throw error
    return data
  },

  // 店舗を削除
  async delete(id: string): Promise<void> {
    const { error } = await supabase
      .from('stores')
      .delete()
      .eq('id', id)
    
    if (error) throw error
  }
}


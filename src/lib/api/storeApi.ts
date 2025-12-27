/**
 * 店舗関連API
 */
import { supabase } from '../supabase'
import { getCurrentOrganizationId } from '@/lib/organization'
import type { Store } from '@/types'

export const storeApi = {
  // 全店舗を取得
  // @param includeTemporary - 臨時会場を含めるかどうか（デフォルト: false）
  async getAll(includeTemporary: boolean = false): Promise<Store[]> {
    let query = supabase.from('stores').select('*')
    
    // 臨時会場を除外する場合
    if (!includeTemporary) {
      query = query.or('is_temporary.is.null,is_temporary.eq.false')
    }
    
    const { data, error } = await query
    
    if (error) throw error
    
    // 指定された順序で並び替え（店舗名またはshort_nameで判定）
    // 順序: 馬場 → 別館① → 別館② → 大久保 → 大塚 → 埼玉大宮
    const storeOrderMap: Record<string, number> = {
      // 1. 馬場
      '馬場': 1,
      '高田馬場店': 1,
      // 2. 別館①
      '別館①': 2,
      // 3. 別館②
      '別館②': 3,
      // 4. 大久保
      '大久保': 4,
      '大久保店': 4,
      // 5. 大塚
      '大塚': 5,
      '大塚店': 5,
      // 6. 埼玉大宮
      '埼玉大宮': 6,
      '埼玉大宮店': 6,
    }
    
    // 店舗の優先順位を取得（nameとshort_nameの両方をチェック）
    const getStoreIndex = (store: Store): number => {
      // short_nameでチェック
      if (store.short_name && storeOrderMap[store.short_name] !== undefined) {
        return storeOrderMap[store.short_name]
      }
      // nameでチェック
      if (store.name && storeOrderMap[store.name] !== undefined) {
        return storeOrderMap[store.name]
      }
      return 999 // リストにない店舗は最後
    }
    
    const sortedData = (data || []).sort((a, b) => {
      // 臨時会場は最後に配置
      if (a.is_temporary && !b.is_temporary) return 1
      if (!a.is_temporary && b.is_temporary) return -1
      if (a.is_temporary && b.is_temporary) {
        // 臨時会場同士は日付順、名前順
        if (a.temporary_date && b.temporary_date) {
          const dateCompare = a.temporary_date.localeCompare(b.temporary_date)
          if (dateCompare !== 0) return dateCompare
        }
        return a.name.localeCompare(b.name, 'ja')
      }
      
      // 通常の店舗同士
      const indexA = getStoreIndex(a)
      const indexB = getStoreIndex(b)
      // 順序が異なる場合は順序に従う
      if (indexA !== indexB) return indexA - indexB
      // 同じ順序（またはどちらも999）の場合は名前順
      return a.name.localeCompare(b.name, 'ja')
    })
    
    return sortedData
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


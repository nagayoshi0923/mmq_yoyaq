/**
 * 店舗関連API
 */
import { supabase } from '../supabase'
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
    
    // 指定された順序で並び替え（店舗名で判定）
    const storeOrder = ['高田馬場店', '別館①', '別館②', '大久保店', '大塚店', '埼玉大宮店']
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
      const indexA = storeOrder.indexOf(a.name)
      const indexB = storeOrder.indexOf(b.name)
      // 両方が順序リストにある場合は順序に従う
      if (indexA !== -1 && indexB !== -1) return indexA - indexB
      // 一方だけが順序リストにある場合は、リストにあるものを先に
      if (indexA !== -1) return -1
      if (indexB !== -1) return 1
      // どちらも順序リストにない場合は名前順
      return a.name.localeCompare(b.name, 'ja')
    })
    
    return sortedData
  },

  // 店舗を作成
  async create(store: Omit<Store, 'id' | 'created_at' | 'updated_at'>): Promise<Store> {
    const { data, error } = await supabase
      .from('stores')
      .insert([store])
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


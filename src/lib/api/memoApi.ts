/**
 * メモ関連API
 */
import { supabase } from '../supabase'
import { getCurrentOrganizationId } from '@/lib/organization'

export const memoApi = {
  // 指定月のメモを取得（組織フィルタ付き）
  async getByMonth(year: number, month: number, organizationId?: string) {
    const startDate = `${year}-${String(month).padStart(2, '0')}-01`
    const lastDay = new Date(year, month, 0).getDate()
    const endDate = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`
    
    // 組織フィルタ（マルチテナント対応）
    const orgId = organizationId || await getCurrentOrganizationId()
    
    let query = supabase
      .from('daily_memos')
      .select(`
        *,
        stores:venue_id (
          id,
          name,
          short_name
        )
      `)
      .gte('date', startDate)
      .lte('date', endDate)
      .order('date', { ascending: true })
    
    if (orgId) {
      query = query.eq('organization_id', orgId)
    }
    
    const { data, error } = await query
    
    if (error) throw error
    return data || []
  },

  // メモを保存（UPSERT）
  async save(date: string, venueId: string, memoText: string) {
    // 組織IDを自動取得（マルチテナント対応）
    const organizationId = await getCurrentOrganizationId()
    if (!organizationId) {
      throw new Error('組織情報が取得できません。再ログインしてください。')
    }
    
    const { data, error } = await supabase
      .from('daily_memos')
      .upsert({
        date,
        venue_id: venueId,
        memo_text: memoText,
        organization_id: organizationId,
        updated_at: new Date().toISOString()
      }, {
        onConflict: 'date,venue_id'
      })
      .select()
    
    if (error) throw error
    return data
  },

  // メモを削除（組織フィルタ付き）
  async delete(date: string, venueId: string) {
    // 組織フィルタ（マルチテナント対応）
    const orgId = await getCurrentOrganizationId()
    
    let query = supabase
      .from('daily_memos')
      .delete()
      .eq('date', date)
      .eq('venue_id', venueId)
    
    if (orgId) {
      query = query.eq('organization_id', orgId)
    }
    
    const { error } = await query
    
    if (error) throw error
  }
}


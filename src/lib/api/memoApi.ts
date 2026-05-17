/**
 * メモ関連API
 */
import { supabase } from '../supabase'
import { getCurrentOrganizationId } from '@/lib/organization'
import { apiClient } from '@/lib/apiClient'

interface DailyMemo {
  date: string
  venue_id: string
  memo_text?: string
  organization_id?: string
  stores?: { id: string; name: string; short_name: string } | null
  created_at?: string
  updated_at?: string
}

export const memoApi = {
  // 指定月のメモを取得
  // バックエンド API (/api/memos) 経由で org_id をサーバー側で強制フィルタ
  // organizationId 引数は後方互換のため残すが未使用
  async getByMonth(year: number, month: number, _organizationId?: string): Promise<DailyMemo[]> {
    return apiClient.get<DailyMemo[]>(`/api/memos?year=${year}&month=${month}`)
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


/**
 * 店舗関連API
 */
import { supabase } from '../supabase'
import { getCurrentOrganizationId } from '@/lib/organization'
import { apiClient } from '@/lib/apiClient'
import type { Store } from '@/types'

// NOTE: Supabase の型推論（select parser）の都合で、select 文字列は literal に寄せる
const STORE_SELECT_FIELDS =
  'id, organization_id, name, short_name, address, access_info, phone_number, email, opening_date, manager_name, status, ownership_type, franchise_fee, capacity, rooms, notes, color, fixed_costs, venue_cost_per_performance, is_temporary, temporary_date, temporary_dates, temporary_venue_names, display_order, region, transport_allowance, kit_group_id, created_at, updated_at' as const

export const storeApi = {
  // 全店舗を取得
  // @param includeTemporary - 臨時会場を含めるかどうか（デフォルト: false）
  // @param organizationId - 後方互換のため引数は残すがバックエンド経由ではサーバー側で JWT から取得するため未使用
  // @param skipOrgFilter - trueの場合、組織フィルタをスキップ（全組織のデータを取得、Supabase 直接クエリ）
  // @param excludeOffice - trueの場合、オフィス（ownership_type='office'）を除外（デフォルト: false）
  //
  // 通常時はバックエンド API (/api/stores) 経由で取得し、org_id をサーバー側で強制フィルタする。
  // includeTemporary/excludeOffice はクライアント側でフィルタリング。
  async getAll(includeTemporary: boolean = false, organizationId?: string, skipOrgFilter?: boolean, excludeOffice: boolean = false): Promise<Store[]> {
    let rawData: Store[]

    if (skipOrgFilter) {
      // skipOrgFilter=true（ライセンス管理者の全組織取得）は Supabase 直接クエリ
      const { data, error } = await supabase.from('stores').select(STORE_SELECT_FIELDS)
      if (error) throw error
      rawData = (data || []) as Store[]
    } else {
      // バックエンド API 経由: org_id をサーバー側で強制フィルタ
      rawData = await apiClient.get<Store[]>('/api/stores')
    }

    // 臨時会場フィルタ（クライアント側）
    let filtered = rawData
    if (!includeTemporary) {
      filtered = filtered.filter(s => !s.is_temporary)
    }
    // オフィス除外（クライアント側）
    if (excludeOffice) {
      filtered = filtered.filter(s => s.ownership_type !== 'office')
    }

    // display_order順にソート（DBのカラムを使用）
    // 臨時会場は最後に配置
    const sortedData = filtered.sort((a, b) => {
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

  // 公開ページ用: 店舗一覧を取得（コスト情報を除外）
  // @param organizationId - 組織ID（必須）
  async getAllPublic(organizationId: string): Promise<Store[]> {
    const { data, error } = await supabase
      .from('stores_public')
      .select('id, organization_id, name, short_name, address, access_info, opening_date, status, ownership_type, capacity, rooms, color, is_temporary, temporary_date, temporary_dates, temporary_venue_names, display_order, region, kit_group_id, created_at, updated_at')
      .eq('organization_id', organizationId)
      .order('display_order', { ascending: true, nullsFirst: false })
    
    if (error) throw error
    return (data || []) as Store[]
  },

  // 店舗の表示順序を一括更新
  async updateDisplayOrder(storeOrders: { id: string; display_order: number }[]): Promise<void> {
    const orgId = await getCurrentOrganizationId()
    if (!orgId) throw new Error('組織情報が取得できません。再ログインしてください。')

    // 並列で更新
    const updates = storeOrders.map(({ id, display_order }) =>
      supabase
        .from('stores')
        .update({ display_order })
        .eq('id', id)
        .eq('organization_id', orgId)
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
    const orgId = await getCurrentOrganizationId()
    if (!orgId) throw new Error('組織情報が取得できません。再ログインしてください。')

    // ⚠️ Mass Assignment 防止: 更新可能フィールドのホワイトリスト
    const STORE_UPDATABLE_FIELDS = [
      'name', 'short_name', 'address', 'access_info', 'phone_number', 'email',
      'opening_date', 'manager_name', 'status', 'ownership_type', 'franchise_fee',
      'capacity', 'rooms', 'notes', 'color', 'fixed_costs', 'venue_cost_per_performance',
      'is_temporary', 'temporary_date', 'temporary_dates', 'temporary_venue_names',
      'display_order', 'region', 'transport_allowance', 'kit_group_id',
    ] as const
    const safeUpdates: Record<string, unknown> = {}
    for (const key of Object.keys(updates)) {
      if ((STORE_UPDATABLE_FIELDS as readonly string[]).includes(key)) {
        safeUpdates[key] = (updates as Record<string, unknown>)[key]
      }
    }

    const { data, error } = await supabase
      .from('stores')
      .update(safeUpdates)
      .eq('id', id)
      .eq('organization_id', orgId)
      .select()
      .single()
    
    if (error) throw error
    return data
  },

  // 店舗を削除
  async delete(id: string): Promise<void> {
    const orgId = await getCurrentOrganizationId()
    if (!orgId) throw new Error('組織情報が取得できません。再ログインしてください。')

    const { error } = await supabase
      .from('stores')
      .delete()
      .eq('id', id)
      .eq('organization_id', orgId)
    
    if (error) throw error
  }
}


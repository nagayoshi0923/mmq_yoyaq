/**
 * 店舗関連API
 *
 * 通常時はバックエンド API (/api/stores) 経由で取得・更新し、
 * organization_id はサーバー側で JWT から強制取得する（マルチテナント境界）。
 *
 * getAllPublic は未認証のお客様向け公開ページで使用するため、
 * RLS で保護された stores_public ビューを Supabase 直接で読む。
 */
import { supabase } from '../supabase'
import { apiClient } from '@/lib/apiClient'
import type { Store, StoreTravelTime, StoreTravelTimeInput } from '@/types'

// NOTE: Supabase の型推論（select parser）の都合で、select 文字列は literal に寄せる
const STORE_SELECT_FIELDS =
  'id, organization_id, name, short_name, address, access_info, phone_number, email, opening_date, manager_name, status, ownership_type, franchise_fee, franchise_fee_type, franchise_fee_percent, capacity, rooms, notes, color, fixed_costs, venue_cost_per_performance, is_temporary, temporary_date, temporary_dates, temporary_venue_names, display_order, region, transport_allowance, kit_group_id, created_at, updated_at' as const

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
  // NOTE: 未認証の公開ページから呼ばれるため、RLS で保護された stores_public ビューを直接読む
  async getAllPublic(organizationId: string): Promise<Store[]> {
    const { data, error } = await supabase
      .from('stores_public')
      .select('id, organization_id, name, short_name, address, access_info, opening_date, status, ownership_type, capacity, rooms, color, is_temporary, temporary_date, temporary_dates, temporary_venue_names, display_order, region, kit_group_id, created_at, updated_at')
      .eq('organization_id', organizationId)
      .order('display_order', { ascending: true, nullsFirst: false })

    if (error) throw error
    return (data || []) as Store[]
  },

  // 店舗の表示順序を一括更新（admin 権限が必要）
  async updateDisplayOrder(storeOrders: { id: string; display_order: number }[]): Promise<void> {
    await apiClient.patch<void>(
      '/api/stores?action=updateDisplayOrder',
      { orders: storeOrders },
    )
  },

  // 店舗間移動時間を取得（組織共有）
  async getTravelTimes(): Promise<StoreTravelTime[]> {
    return apiClient.get<StoreTravelTime[]>('/api/stores?action=travelTimes')
  },

  // 店舗間移動時間を一括保存（admin 権限が必要）
  // minutes=null の項目は削除する
  async upsertTravelTimes(items: StoreTravelTimeInput[]): Promise<StoreTravelTime[]> {
    return apiClient.patch<StoreTravelTime[]>(
      '/api/stores?action=upsertTravelTimes',
      { items },
    )
  },

  // 店舗を作成（admin 権限が必要）
  async create(store: Omit<Store, 'id' | 'created_at' | 'updated_at'>): Promise<Store> {
    return apiClient.post<Store>('/api/stores', store)
  },

  // 店舗を更新（admin 権限が必要）
  async update(id: string, updates: Partial<Store>): Promise<Store> {
    return apiClient.patch<Store>(`/api/stores?id=${encodeURIComponent(id)}`, updates)
  },

  // 店舗を削除（admin 権限が必要）
  async delete(id: string): Promise<void> {
    await apiClient.delete<void>(`/api/stores?id=${encodeURIComponent(id)}`)
  },
}

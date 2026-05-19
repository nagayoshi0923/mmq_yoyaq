/**
 * スタッフ関連API
 *
 * 通常時はバックエンド API (/api/staff) 経由で取得・更新し、
 * organization_id はサーバー側で JWT から強制取得する（マルチテナント境界）。
 *
 * skipOrgFilter=true（ライセンス管理者の全組織取得）のみ Supabase 直接クエリを使う。
 */
import { supabase } from '../supabase'
import { apiClient } from '@/lib/apiClient'
import type { Staff } from '@/types'

// NOTE: Supabase の型推論（select parser）の都合で、select 文字列は literal に寄せる
const STAFF_SELECT_FIELDS =
  // DB側は discord_user_id。フロントの既存実装（discord_id）に合わせて alias する。
  'id, organization_id, name, line_name, x_account, discord_id:discord_user_id, discord_channel_id, role, stores, ng_days, want_to_learn, available_scenarios, notes, phone, email, user_id, availability, experience, special_scenarios, status, avatar_url, avatar_color, created_at, updated_at' as const

export const staffApi = {
  // 全スタッフを取得
  // organizationId: 後方互換のため引数は残すがバックエンド経由ではサーバー側で JWT から取得するため未使用
  // skipOrgFilter: trueの場合、組織フィルタをスキップ（全組織のデータを取得、Supabase 直接クエリ）
  async getAll(organizationId?: string, skipOrgFilter?: boolean): Promise<Staff[]> {
    if (skipOrgFilter) {
      // skipOrgFilter=true（ライセンス管理者の全組織取得）は Supabase 直接クエリ
      const { data, error } = await supabase
        .from('staff')
        .select(STAFF_SELECT_FIELDS)
        .order('name', { ascending: true })
      if (error) throw error
      return data || []
    }

    // バックエンド API 経由: org_id をサーバー側で強制フィルタ
    return apiClient.get<Staff[]>('/api/staff')
  },

  // スタッフを作成（admin 権限が必要）
  async create(staff: Omit<Staff, 'id' | 'created_at' | 'updated_at'>): Promise<Staff> {
    return apiClient.post<Staff>('/api/staff', staff)
  },

  // スタッフを更新（role 変更は admin 権限が必要）
  //
  // 名前変更時は、サーバー側で schedule_events.gms / reservations.assigned_staff・gm_staff
  // を自動で同期する。
  async update(id: string, updates: Partial<Staff>): Promise<Staff> {
    return apiClient.patch<Staff>(`/api/staff?id=${encodeURIComponent(id)}`, updates)
  },

  // スタッフの担当シナリオを更新（シナリオの available_gms も同期更新）
  async updateSpecialScenarios(id: string, specialScenarios: string[]): Promise<Staff> {
    return apiClient.patch<Staff>(
      `/api/staff?id=${encodeURIComponent(id)}&action=updateSpecialScenarios`,
      { special_scenarios: specialScenarios },
    )
  },

  // スタッフを削除（admin 権限が必要）
  async delete(id: string): Promise<void> {
    await apiClient.delete<void>(`/api/staff?id=${encodeURIComponent(id)}`)
  },

  // IDでスタッフを取得
  async getById(id: string): Promise<Staff | null> {
    return apiClient.get<Staff | null>(`/api/staff?id=${encodeURIComponent(id)}`)
  },

  // ユーザーIDでスタッフを取得
  async getByUserId(userId: string): Promise<Staff | null> {
    return apiClient.get<Staff | null>(`/api/staff?user_id=${encodeURIComponent(userId)}`)
  },
}

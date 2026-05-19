/**
 * シナリオマスタ関連API
 * scenario_masters + organization_scenarios の2層構造に対応
 *
 * scenario_masters への read/write はすべてバックエンド API (/api/scenario-masters) 経由。
 * organization_scenarios は従来通り /api/org-scenarios + supabase 併用。
 */
import { supabase } from '../supabase'
import { getCurrentOrganizationId } from '@/lib/organization'
import { apiClient } from '@/lib/apiClient'
import { logger } from '@/utils/logger'

// ============================================================
// 型定義
// ============================================================

export interface ScenarioMaster {
  id: string
  title: string
  author: string | null
  author_id: string | null
  key_visual_url: string | null
  description: string | null
  player_count_min: number
  player_count_max: number
  official_duration: number
  genre: string[]
  difficulty: string | null
  synopsis: string | null
  caution: string | null
  required_items: string[] | null
  master_status: 'draft' | 'pending' | 'approved' | 'rejected'
  submitted_by_organization_id: string | null
  approved_by: string | null
  approved_at: string | null
  rejection_reason: string | null
  created_at: string
  updated_at: string
  created_by: string | null
}

export interface OrganizationScenario {
  id: string
  organization_id: string
  scenario_master_id: string
  slug: string | null
  duration: number | null
  participation_fee: number | null
  extra_preparation_time: number | null
  org_status: 'available' | 'unavailable' | 'coming_soon'
  custom_key_visual_url: string | null
  custom_description: string | null
  custom_synopsis: string | null
  custom_caution: string | null
  pricing_patterns: any[]
  gm_assignments: any[]
  booking_start_date: string | null
  booking_end_date: string | null
  individual_notice_template: string | null
  created_at: string
  updated_at: string
}

// ビューから取得する結合型
export interface OrganizationScenarioWithMaster {
  id: string
  organization_id: string
  scenario_master_id: string
  slug: string | null
  org_status: 'available' | 'unavailable' | 'coming_soon'
  pricing_patterns: any[]
  gm_assignments: any[]
  created_at: string
  updated_at: string
  // マスタ情報（組織設定があればそちらを優先）
  title: string
  author: string | null
  author_id: string | null
  key_visual_url: string | null
  description: string | null
  synopsis: string | null
  caution: string | null
  player_count_min: number
  player_count_max: number
  duration: number
  genre: string[]
  difficulty: string | null
  participation_fee: number | null
  extra_preparation_time: number | null
  master_status: 'draft' | 'pending' | 'approved' | 'rejected'
}

// ============================================================
// シナリオマスタAPI
// ============================================================

export const scenarioMasterApi = {
  /**
   * 全シナリオマスタを取得（検索用）
   * サーバ側で権限フィルタ:
   *   - license_admin: 全件
   *   - その他: approved 全件 + 自組織提出の draft/pending/rejected
   */
  async getAll(): Promise<ScenarioMaster[]> {
    try {
      return await apiClient.get<ScenarioMaster[]>('/api/scenario-masters?type=list')
    } catch (error) {
      logger.error('Failed to get scenario masters:', error)
      throw error
    }
  },

  /**
   * 承認済みシナリオマスタのみ取得（MMQトップ用）
   */
  async getApproved(): Promise<ScenarioMaster[]> {
    try {
      return await apiClient.get<ScenarioMaster[]>('/api/scenario-masters?type=approved')
    } catch (error) {
      logger.error('Failed to get approved scenario masters:', error)
      throw error
    }
  },

  /**
   * IDでシナリオマスタを取得
   * 自分が見るべきでないレコードはサーバ側で null として返される
   */
  async getById(id: string): Promise<ScenarioMaster | null> {
    try {
      return await apiClient.get<ScenarioMaster | null>(
        `/api/scenario-masters?type=by-id&id=${encodeURIComponent(id)}`
      )
    } catch (error) {
      logger.error('Failed to get scenario master by id:', error)
      throw error
    }
  },

  /**
   * 新規シナリオマスタを作成（draft状態で作成）
   * submitted_by_organization_id はサーバ側で JWT から強制される
   */
  async create(data: Partial<ScenarioMaster>): Promise<ScenarioMaster> {
    try {
      return await apiClient.post<ScenarioMaster>('/api/scenario-masters', data)
    } catch (error) {
      logger.error('Failed to create scenario master:', error)
      throw error
    }
  },

  /**
   * シナリオマスタを更新（提出元組織のスタッフ または license_admin のみ）
   */
  async update(id: string, data: Partial<ScenarioMaster>): Promise<ScenarioMaster> {
    try {
      return await apiClient.patch<ScenarioMaster>(
        `/api/scenario-masters?type=update&id=${encodeURIComponent(id)}`,
        data
      )
    } catch (error) {
      logger.error('Failed to update scenario master:', error)
      throw error
    }
  },

  /**
   * ステータスを変更（draft → pending）
   */
  async publish(id: string): Promise<ScenarioMaster> {
    try {
      return await apiClient.patch<ScenarioMaster>(
        `/api/scenario-masters?type=publish&id=${encodeURIComponent(id)}`,
        {}
      )
    } catch (error) {
      logger.error('Failed to publish scenario master:', error)
      throw error
    }
  },

  /**
   * 承認（pending → approved）※license_admin のみ
   * approvedBy はサーバ側で JWT の userId から自動設定される
   */
  async approve(id: string, _approvedBy?: string): Promise<ScenarioMaster> {
    try {
      return await apiClient.patch<ScenarioMaster>(
        `/api/scenario-masters?type=approve&id=${encodeURIComponent(id)}`,
        {}
      )
    } catch (error) {
      logger.error('Failed to approve scenario master:', error)
      throw error
    }
  },

  /**
   * 却下（pending → rejected）※license_admin のみ
   */
  async reject(id: string, reason: string): Promise<ScenarioMaster> {
    try {
      return await apiClient.patch<ScenarioMaster>(
        `/api/scenario-masters?type=reject&id=${encodeURIComponent(id)}`,
        { reason }
      )
    } catch (error) {
      logger.error('Failed to reject scenario master:', error)
      throw error
    }
  },
}

// ============================================================
// 組織シナリオAPI
// ============================================================

export const organizationScenarioApi = {
  /**
   * 自組織のシナリオ一覧を取得（ビュー使用）
   * 注: organizationId 引数は後方互換のため残しているが、サーバー側で JWT から強制されるため無視される
   */
  async getAll(_organizationId?: string): Promise<OrganizationScenarioWithMaster[]> {
    try {
      const data = await apiClient.get<OrganizationScenarioWithMaster[]>('/api/org-scenarios')
      return data ?? []
    } catch (error) {
      logger.error('Failed to get organization scenarios:', error)
      throw error
    }
  },

  /**
   * 公開中のシナリオのみ取得（予約サイト用）
   */
  async getAvailable(_organizationId?: string): Promise<OrganizationScenarioWithMaster[]> {
    try {
      const data = await apiClient.get<OrganizationScenarioWithMaster[]>('/api/org-scenarios?status=available')
      return data ?? []
    } catch (error) {
      logger.error('Failed to get available organization scenarios:', error)
      throw error
    }
  },

  /**
   * IDで組織シナリオを取得（自組織のみ。サーバー側で organization_id を強制）
   */
  async getById(id: string, _organizationId?: string): Promise<OrganizationScenarioWithMaster | null> {
    try {
      return await apiClient.get<OrganizationScenarioWithMaster | null>(
        `/api/org-scenarios?id=${encodeURIComponent(id)}`
      )
    } catch (error) {
      logger.error('Failed to get organization scenario by id:', error)
      throw error
    }
  },

  /**
   * slugで組織シナリオを取得（自組織のみ。サーバー側で organization_id を強制）
   */
  async getBySlug(slug: string, _organizationId?: string): Promise<OrganizationScenarioWithMaster | null> {
    try {
      return await apiClient.get<OrganizationScenarioWithMaster | null>(
        `/api/org-scenarios?slug=${encodeURIComponent(slug)}`
      )
    } catch (error) {
      logger.error('Failed to get organization scenario by slug:', error)
      throw error
    }
  },

  /**
   * マスタからシナリオを追加（自組織用）
   */
  async addFromMaster(
    scenarioMasterId: string,
    settings: Partial<OrganizationScenario>
  ): Promise<OrganizationScenario> {
    const orgId = await getCurrentOrganizationId()
    if (!orgId) {
      throw new Error('Organization ID is required')
    }
    
    const { data, error } = await supabase
      .from('organization_scenarios')
      .insert({
        organization_id: orgId,
        scenario_master_id: scenarioMasterId,
        ...settings,
      })
      .select()
      .single()
    
    if (error) {
      logger.error('Failed to add scenario from master:', error)
      throw error
    }
    return data
  },

  /**
   * 組織シナリオを更新（自組織のみ）
   */
  async update(id: string, data: Partial<OrganizationScenario>): Promise<OrganizationScenario> {
    const orgId = await getCurrentOrganizationId()
    if (!orgId) {
      throw new Error('Organization ID is required')
    }

    const { data: updated, error } = await supabase
      .from('organization_scenarios')
      .update(data)
      .eq('id', id)
      .eq('organization_id', orgId)
      .select()
      .single()

    if (error) {
      logger.error('Failed to update organization scenario:', error)
      throw error
    }
    return updated
  },

  /**
   * 組織シナリオを削除（自組織のみ）
   */
  async delete(id: string): Promise<void> {
    const orgId = await getCurrentOrganizationId()
    if (!orgId) {
      throw new Error('Organization ID is required')
    }

    const { error } = await supabase
      .from('organization_scenarios')
      .delete()
      .eq('id', id)
      .eq('organization_id', orgId)

    if (error) {
      logger.error('Failed to delete organization scenario:', error)
      throw error
    }
  },
}


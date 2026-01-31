/**
 * シナリオマスタ関連API
 * scenario_masters + organization_scenarios の2層構造に対応
 */
import { supabase } from '../supabase'
import { getCurrentOrganizationId } from '@/lib/organization'
import { logger } from '@/utils/logger'

// NOTE: Supabase の型推論（select parser）の都合で、select 文字列は literal に寄せる
const SCENARIO_MASTER_SELECT_FIELDS =
  'id, title, author, author_id, key_visual_url, description, player_count_min, player_count_max, official_duration, genre, difficulty, synopsis, caution, required_items, master_status, submitted_by_organization_id, approved_by, approved_at, rejection_reason, created_at, updated_at, created_by' as const

const ORG_SCENARIO_WITH_MASTER_SELECT_FIELDS =
  'id, organization_id, scenario_master_id, slug, org_status, pricing_patterns, gm_assignments, created_at, updated_at, title, author, author_id, key_visual_url, description, synopsis, caution, player_count_min, player_count_max, duration, genre, difficulty, participation_fee, extra_preparation_time, master_status' as const

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
  extra_preparation_time: number
  org_status: 'available' | 'unavailable' | 'coming_soon'
  custom_key_visual_url: string | null
  custom_description: string | null
  custom_synopsis: string | null
  custom_caution: string | null
  pricing_patterns: any[]
  gm_assignments: any[]
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
  extra_preparation_time: number
  master_status: 'draft' | 'pending' | 'approved' | 'rejected'
}

// ============================================================
// シナリオマスタAPI
// ============================================================

export const scenarioMasterApi = {
  /**
   * 全シナリオマスタを取得（検索用）
   * - approved: 全員が見れる
   * - pending/rejected: 全員が見れる（利用可能）
   * - draft: 自組織のみ
   */
  async getAll(): Promise<ScenarioMaster[]> {
    const { data, error } = await supabase
      .from('scenario_masters')
      .select(SCENARIO_MASTER_SELECT_FIELDS)
      .order('title', { ascending: true })
    
    if (error) {
      logger.error('Failed to get scenario masters:', error)
      throw error
    }
    return data || []
  },

  /**
   * 承認済みシナリオマスタのみ取得（MMQトップ用）
   */
  async getApproved(): Promise<ScenarioMaster[]> {
    const { data, error } = await supabase
      .from('scenario_masters')
      .select(SCENARIO_MASTER_SELECT_FIELDS)
      .eq('master_status', 'approved')
      .order('title', { ascending: true })
    
    if (error) {
      logger.error('Failed to get approved scenario masters:', error)
      throw error
    }
    return data || []
  },

  /**
   * IDでシナリオマスタを取得
   */
  async getById(id: string): Promise<ScenarioMaster | null> {
    const { data, error } = await supabase
      .from('scenario_masters')
      .select(SCENARIO_MASTER_SELECT_FIELDS)
      .eq('id', id)
      .single()
    
    if (error) {
      if (error.code === 'PGRST116') return null
      logger.error('Failed to get scenario master by id:', error)
      throw error
    }
    return data
  },

  /**
   * 新規シナリオマスタを作成（draft状態で作成）
   */
  async create(data: Partial<ScenarioMaster>): Promise<ScenarioMaster> {
    const orgId = await getCurrentOrganizationId()
    
    const { data: created, error } = await supabase
      .from('scenario_masters')
      .insert({
        ...data,
        master_status: 'draft',
        submitted_by_organization_id: orgId,
      })
      .select()
      .single()
    
    if (error) {
      logger.error('Failed to create scenario master:', error)
      throw error
    }
    return created
  },

  /**
   * シナリオマスタを更新
   */
  async update(id: string, data: Partial<ScenarioMaster>): Promise<ScenarioMaster> {
    const { data: updated, error } = await supabase
      .from('scenario_masters')
      .update(data)
      .eq('id', id)
      .select()
      .single()
    
    if (error) {
      logger.error('Failed to update scenario master:', error)
      throw error
    }
    return updated
  },

  /**
   * ステータスを変更（draft → pending）
   */
  async publish(id: string): Promise<ScenarioMaster> {
    return this.update(id, { master_status: 'pending' })
  },

  /**
   * 承認（pending → approved）※MMQ運営者のみ
   */
  async approve(id: string, approvedBy: string): Promise<ScenarioMaster> {
    return this.update(id, {
      master_status: 'approved',
      approved_by: approvedBy,
      approved_at: new Date().toISOString(),
    })
  },

  /**
   * 却下（pending → rejected）※MMQ運営者のみ
   */
  async reject(id: string, reason: string): Promise<ScenarioMaster> {
    return this.update(id, {
      master_status: 'rejected',
      rejection_reason: reason,
    })
  },
}

// ============================================================
// 組織シナリオAPI
// ============================================================

export const organizationScenarioApi = {
  /**
   * 自組織のシナリオ一覧を取得（ビュー使用）
   */
  async getAll(organizationId?: string): Promise<OrganizationScenarioWithMaster[]> {
    const orgId = organizationId || await getCurrentOrganizationId()
    
    let query = supabase
      .from('organization_scenarios_with_master')
      .select(ORG_SCENARIO_WITH_MASTER_SELECT_FIELDS)
      .order('title', { ascending: true })
    
    if (orgId) {
      query = query.eq('organization_id', orgId)
    }
    
    const { data, error } = await query
    
    if (error) {
      logger.error('Failed to get organization scenarios:', error)
      throw error
    }
    return data || []
  },

  /**
   * 公開中のシナリオのみ取得（予約サイト用）
   */
  async getAvailable(organizationId?: string): Promise<OrganizationScenarioWithMaster[]> {
    const orgId = organizationId || await getCurrentOrganizationId()
    
    let query = supabase
      .from('organization_scenarios_with_master')
      .select(ORG_SCENARIO_WITH_MASTER_SELECT_FIELDS)
      .eq('org_status', 'available')
      .order('title', { ascending: true })
    
    if (orgId) {
      query = query.eq('organization_id', orgId)
    }
    
    const { data, error } = await query
    
    if (error) {
      logger.error('Failed to get available organization scenarios:', error)
      throw error
    }
    return data || []
  },

  /**
   * IDで組織シナリオを取得
   */
  async getById(id: string): Promise<OrganizationScenarioWithMaster | null> {
    const { data, error } = await supabase
      .from('organization_scenarios_with_master')
      .select(ORG_SCENARIO_WITH_MASTER_SELECT_FIELDS)
      .eq('id', id)
      .single()
    
    if (error) {
      if (error.code === 'PGRST116') return null
      logger.error('Failed to get organization scenario by id:', error)
      throw error
    }
    return data
  },

  /**
   * slugで組織シナリオを取得
   */
  async getBySlug(slug: string, organizationId?: string): Promise<OrganizationScenarioWithMaster | null> {
    const orgId = organizationId || await getCurrentOrganizationId()
    
    let query = supabase
      .from('organization_scenarios_with_master')
      .select(ORG_SCENARIO_WITH_MASTER_SELECT_FIELDS)
      .eq('slug', slug)
    
    if (orgId) {
      query = query.eq('organization_id', orgId)
    }
    
    const { data, error } = await query.single()
    
    if (error) {
      if (error.code === 'PGRST116') return null
      logger.error('Failed to get organization scenario by slug:', error)
      throw error
    }
    return data
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
   * 組織シナリオを更新
   */
  async update(id: string, data: Partial<OrganizationScenario>): Promise<OrganizationScenario> {
    const { data: updated, error } = await supabase
      .from('organization_scenarios')
      .update(data)
      .eq('id', id)
      .select()
      .single()
    
    if (error) {
      logger.error('Failed to update organization scenario:', error)
      throw error
    }
    return updated
  },

  /**
   * 組織シナリオを削除
   */
  async delete(id: string): Promise<void> {
    const { error } = await supabase
      .from('organization_scenarios')
      .delete()
      .eq('id', id)
    
    if (error) {
      logger.error('Failed to delete organization scenario:', error)
      throw error
    }
  },
}


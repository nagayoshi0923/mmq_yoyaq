/**
 * シナリオマスタ関連API
 *
 * scenario_masters への read/write はすべてバックエンド API (/api/scenario-masters) 経由。
 * organization_scenarios はこのモジュールの対象外
 * （読み取りは useOrganizationScenariosQuery、書き込みは /api/scenarios・/api/org-scenarios 側）。
 */
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

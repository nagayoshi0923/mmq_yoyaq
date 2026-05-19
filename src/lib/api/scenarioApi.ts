/**
 * シナリオ関連API
 *
 * write 系 (create/update/delete/updateAvailableGms/updateAvailableGmsWithSync) と、
 * 残り read 系 (getAllLegacy/getPublic/getPaginated/getPerformanceCount/
 * getScenarioStats/getAllScenarioStats) はバックエンド API (/api/scenarios) 経由で実行する。
 *
 * org_id はフロントから渡さず、サーバー側で JWT から取得する（マルチテナント境界）。
 * organizationId 引数は後方互換のため残してあるが、値はサーバー側で無視される。
 */
import { supabase } from '../supabase'
import { getCurrentOrganizationId } from '@/lib/organization'
import { apiClient } from '@/lib/apiClient'
import type { Scenario } from '@/types'
import type { PaginatedResponse } from './types'
import { logger } from '@/utils/logger'

// organization_scenarios_with_master ビュー用のSELECTフィールド
// （skipOrgFilter=true の license_admin 用フォールバックでのみ利用）
const ORG_SCENARIOS_VIEW_SELECT_FIELDS =
  'id, org_scenario_id, organization_id, scenario_master_id, slug, status, org_status, title, author, author_email, author_id, report_display_name, key_visual_url, description, synopsis, caution, player_count_min, player_count_max, male_count, female_count, other_count, duration, weekend_duration, genre, difficulty, has_pre_reading, release_date, official_site_url, required_props, participation_fee, gm_test_participation_fee, participation_costs, flexible_pricing, use_flexible_pricing, license_amount, gm_test_license_amount, franchise_license_amount, franchise_gm_test_license_amount, external_license_amount, external_gm_test_license_amount, fc_receive_license_amount, fc_receive_gm_test_license_amount, fc_author_license_amount, fc_author_gm_test_license_amount, gm_costs, gm_count, gm_assignments, available_gms, experienced_staff, available_stores, production_cost, production_costs, depreciation_per_performance, extra_preparation_time, play_count, notes, created_at, updated_at, master_status, pricing_patterns, is_shared, scenario_type, rating, kit_count, license_rewards, is_recommended, survey_url, survey_enabled, survey_deadline_days, characters, pre_reading_notice_message, booking_start_date, booking_end_date, individual_notice_template, character_assignment_method, private_booking_time_slots, private_booking_blocked_slots, private_booking_time_slots_weekend' as const

export const scenarioApi = {
  // スタッフ・管理者向け: 自組織のシナリオ全件を取得する。
  // バックエンド API (/api/scenarios) 経由で取得するため、
  // org_id の強制フィルタはサーバー側で行われる（RLS に依存しない）。
  //
  // organizationId: 後方互換のため引数は残すが、サーバー側で JWT から org_id を
  //   確実に取得するため、フロントから渡した値は使用されない。
  // skipOrgFilter: license_admin が全組織を取得したい場合にのみ使用（将来拡張用）。
  //   現時点ではバックエンド未対応のため、true の場合は旧来の Supabase 直接クエリにフォールバック。
  async getAll(organizationId?: string, skipOrgFilter?: boolean): Promise<Scenario[]> {
    // skipOrgFilter=true（ライセンス管理者の全組織取得）は Supabase 直接クエリを使う
    if (skipOrgFilter) {
      const { data, error } = await supabase
        .from('organization_scenarios_with_master')
        .select(ORG_SCENARIOS_VIEW_SELECT_FIELDS)
        .order('title', { ascending: true })
      if (error) throw error
      return (data || []) as unknown as Scenario[]
    }

    // バックエンド API 経由: org_id をサーバー側で強制フィルタ（RLS に依存しない）
    return apiClient.get<Scenario[]>('/api/scenarios')
  },

  // 旧 scenarios テーブルから全シナリオを取得（キット管理等レガシー機能用）
  // NOTE: scenarios テーブル廃止後は削除予定
  async getAllLegacy(_organizationId?: string): Promise<Scenario[]> {
    return apiClient.get<Scenario[]>('/api/scenarios?type=legacy')
  },

  // 公開用シナリオを取得（status='available'のみ、必要なフィールドのみ）
  // organizationId 引数は後方互換のため残すが、サーバー側で JWT から org_id を取得するため使われない。
  async getPublic(_organizationId?: string): Promise<Partial<Scenario>[]> {
    return apiClient.get<Partial<Scenario>[]>('/api/scenarios?type=public')
  },

  // IDでシナリオを取得（scenario_master_id で検索、見つからなければ org_scenario_id でも検索）
  // organizationId 引数は後方互換のため残すが、サーバー側で JWT から org_id を取得するため使われない。
  // 自組織で見つからない場合は is_shared=true の共有シナリオから検索（サーバー側でフィルタ）。
  async getById(_id: string, _organizationId?: string): Promise<Scenario | null> {
    try {
      const params = new URLSearchParams({ id: _id })
      const result = await apiClient.get<Scenario | null>(`/api/scenarios?${params}`)
      return result
    } catch (err) {
      logger.error('[scenarioApi.getById] エラー:', err)
      throw err
    }
  },

  /**
   * 編集ダイアログ用: ビューの id（= scenario_master_id）で見つからなければ
   * organization_scenarios の主キー（ビュー上の org_scenario_id）でも解決する。
   * 保存直後に一覧キャッシュが未更新のときのフォールバックに使う。
   */
  async resolveOrganizationScenarioView(
    idOrOrgScenarioRowId: string,
    organizationId?: string
  ): Promise<Scenario | null> {
    const byMaster = await this.getById(idOrOrgScenarioRowId, organizationId)
    if (byMaster) return byMaster

    const orgId = organizationId || (await getCurrentOrganizationId())
    if (!orgId) return null

    const { data, error } = await supabase
      .from('organization_scenarios_with_master')
      .select(ORG_SCENARIOS_VIEW_SELECT_FIELDS)
      .eq('org_scenario_id', idOrOrgScenarioRowId)
      .eq('organization_id', orgId)
      .maybeSingle()

    if (error) {
      logger.error('resolveOrganizationScenarioView:', error)
      return null
    }
    return (data as unknown as Scenario) || null
  },

  // slugでシナリオを取得（バックエンド経由）。
  // organizationId 引数は後方互換のため残すが、サーバー側で JWT から org_id を取得するため使われない。
  // 自組織で見つからない場合は is_shared=true の共有シナリオから検索（サーバー側でフィルタ）。
  async getBySlug(slug: string, organizationId?: string): Promise<Scenario | null> {
    try {
      const params = new URLSearchParams({ slug })
      if (organizationId) params.set('org_id', organizationId)
      const result = await apiClient.get<Scenario | null>(`/api/scenarios?${params}`)
      return result
    } catch (err) {
      logger.error('[scenarioApi.getBySlug] エラー:', err)
      throw err
    }
  },

  // IDまたはslugでシナリオを取得（slugを優先、見つからなければIDで検索）
  async getByIdOrSlug(idOrSlug: string, organizationId?: string): Promise<Scenario | null> {
    const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    const isUuid = uuidPattern.test(idOrSlug)

    if (isUuid) {
      return this.getById(idOrSlug, organizationId)
    }

    const bySlug = await this.getBySlug(idOrSlug, organizationId)
    if (bySlug) return bySlug

    return this.getById(idOrSlug, organizationId)
  },

  // ページネーション対応：シナリオを取得（バックエンド経由）
  async getPaginated(
    page: number = 0,
    pageSize: number = 20,
    _organizationId?: string,
  ): Promise<PaginatedResponse<Scenario>> {
    const params = new URLSearchParams({
      type: 'paginated',
      page: String(page),
      pageSize: String(pageSize),
    })
    return apiClient.get<PaginatedResponse<Scenario>>(`/api/scenarios?${params}`)
  },

  // シナリオを作成（バックエンド経由）。org_id は JWT から取得される。
  async create(scenario: Omit<Scenario, 'id' | 'created_at' | 'updated_at'>): Promise<Scenario> {
    return apiClient.post<Scenario>('/api/scenarios', { scenario })
  },

  // シナリオを更新（バックエンド経由）。
  // id: scenario_master_id として検索（organization_scenarios_with_master の id = scenario_master_id）
  async update(id: string, updates: Partial<Scenario>): Promise<Scenario> {
    const params = new URLSearchParams({ action: 'update', id })
    return apiClient.patch<Scenario>(`/api/scenarios?${params}`, { updates })
  },

  // シナリオを削除（organization_scenarios のみ削除、scenario_masters は残す）
  // id: scenario_master_id
  async delete(id: string): Promise<void> {
    const params = new URLSearchParams({ id })
    await apiClient.delete<{ success: boolean }>(`/api/scenarios?${params}`)
  },

  // シナリオの担当GMを更新（バックエンド経由）
  async updateAvailableGms(id: string, availableGms: string[]): Promise<Scenario> {
    const params = new URLSearchParams({ action: 'updateAvailableGms', id })
    return apiClient.patch<Scenario>(`/api/scenarios?${params}`, { availableGms })
  },

  // シナリオの累計公演回数を取得（バックエンド経由）
  // scenarioId: scenario_master_id
  async getPerformanceCount(scenarioId: string): Promise<number> {
    const params = new URLSearchParams({ type: 'performance-count', scenarioId })
    const result = await apiClient.get<{ count: number }>(`/api/scenarios?${params}`)
    return result.count ?? 0
  },

  // シナリオの統計情報を取得（バックエンド経由）
  // 今日までの公演のみ計算（未来の公演は含めない）
  // scenarioId は scenario_master_id
  //
  // NOTE: 旧実装はカスタム GM コスト未設定時にフロントの useSalarySettings を使って
  // GM 報酬を動的計算していたが、サーバ実装では salary_settings をまだ参照していない。
  // 影響: gm_costs を設定していないシナリオで GM コスト集計が 0 になる可能性がある。
  // TODO: サーバ側でも calculateGmWage 相当を実装する。
  async getScenarioStats(scenarioId: string): Promise<{
    performanceCount: number
    cancelledCount: number
    totalRevenue: number
    totalParticipants: number
    totalStaffParticipants: number
    totalGmCost: number
    totalLicenseCost: number
    totalVenueCost: number
    venueCostPerPerformance: number
    firstPerformanceDate: string | null
    performanceDates: Array<{ date: string; category: string; participants: number; demoParticipants: number; staffParticipants: number; revenue: number; startTime: string; storeId: string | null; isCancelled: boolean }>
    futurePerformanceCount: number
    futureReservationCount: number
  }> {
    const params = new URLSearchParams({ type: 'stats', scenarioId })
    return apiClient.get(`/api/scenarios?${params}`)
  },

  // 全シナリオの統計情報を一括取得（バックエンド経由）
  async getAllScenarioStats(): Promise<Record<string, {
    performanceCount: number
    cancelledCount: number
    totalRevenue: number
  }>> {
    return apiClient.get('/api/scenarios?type=all-stats')
  },

  // シナリオの担当GMを更新（バックエンド経由）
  // NOTE: staff.special_scenarios への同期は廃止。staff_scenario_assignments が唯一のデータソース
  // id: scenario_master_id
  async updateAvailableGmsWithSync(id: string, availableGms: string[]): Promise<Scenario> {
    const params = new URLSearchParams({ action: 'updateAvailableGmsWithSync', id })
    return apiClient.patch<Scenario>(`/api/scenarios?${params}`, { availableGms })
  },
}

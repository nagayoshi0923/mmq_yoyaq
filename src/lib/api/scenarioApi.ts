/**
 * シナリオ関連API
 */
import { supabase } from '../supabase'
import { getCurrentOrganizationId } from '@/lib/organization'
import type { Scenario } from '@/types'
import type { PaginatedResponse } from './types'
import { logger } from '@/utils/logger'

// NOTE: Supabase の型推論（select parser）の都合で、select 文字列は literal に寄せる
const SCENARIO_SELECT_FIELDS =
  // NOTE: scenarios テーブルに存在するカラムのみ（存在しないカラムを含めると PostgREST が 400 を返す）
  'id, title, slug, description, author, author_email, report_display_name, duration, weekend_duration, player_count_min, player_count_max, male_count, female_count, other_count, difficulty, rating, status, scenario_type, participation_fee, participation_costs, gm_costs, license_amount, gm_test_license_amount, franchise_license_amount, franchise_gm_test_license_amount, external_license_amount, external_gm_test_license_amount, license_rewards, production_cost, genre, has_pre_reading, key_visual_url, notes, required_props, production_costs, kit_count, gm_count, available_stores, scenario_master_id, organization_id, is_shared, extra_preparation_time, available_gms, play_count, release_date, is_recommended, created_at, updated_at' as const

// organization_scenarios_with_master ビュー用のSELECTフィールド
const ORG_SCENARIOS_VIEW_SELECT_FIELDS = 
  'id, org_scenario_id, organization_id, scenario_master_id, slug, status, title, author, author_email, author_id, report_display_name, key_visual_url, description, synopsis, caution, player_count_min, player_count_max, male_count, female_count, other_count, duration, weekend_duration, genre, difficulty, has_pre_reading, release_date, official_site_url, required_props, participation_fee, gm_test_participation_fee, participation_costs, flexible_pricing, use_flexible_pricing, license_amount, gm_test_license_amount, franchise_license_amount, franchise_gm_test_license_amount, gm_costs, gm_count, gm_assignments, available_gms, experienced_staff, available_stores, production_cost, production_costs, depreciation_per_performance, extra_preparation_time, play_count, notes, created_at, updated_at, master_status, is_shared, scenario_type, rating, kit_count, license_rewards' as const

export const scenarioApi = {
  // 全シナリオを取得
  // organizationId: 指定した場合そのIDを使用、未指定の場合はログインユーザーの組織で自動フィルタ
  // skipOrgFilter: trueの場合、組織フィルタをスキップ（全組織のデータを取得）
  async getAll(organizationId?: string, skipOrgFilter?: boolean): Promise<Scenario[]> {
    // organization_scenarios_with_master ビューを使用
    let query = supabase
      .from('organization_scenarios_with_master')
      .select(ORG_SCENARIOS_VIEW_SELECT_FIELDS)
    
    // 組織フィルタリング
    if (!skipOrgFilter) {
      const orgId = organizationId || await getCurrentOrganizationId()
      logger.log('🏢 シナリオ取得: organization_id =', orgId)
      if (orgId) {
        query = query.eq('organization_id', orgId)
      } else {
        logger.log('⚠️ organization_idがnullのため、フィルタなしで取得')
      }
    }
    
    const { data, error } = await query.order('title', { ascending: true })
    
    if (error) throw error
    return (data || []) as unknown as Scenario[]
  },

  // 旧scenarios テーブルから全シナリオを取得（キット管理等レガシー機能用）
  // NOTE: scenarios テーブル廃止後は削除予定
  async getAllLegacy(organizationId?: string): Promise<Scenario[]> {
    let query = supabase
      .from('scenarios')
      .select(SCENARIO_SELECT_FIELDS)
    
    const orgId = organizationId || await getCurrentOrganizationId()
    if (orgId) {
      query = query.eq('organization_id', orgId)
    }
    
    const { data, error } = await query.order('title', { ascending: true })
    
    if (error) throw error
    return (data || []) as Scenario[]
  },

  // 公開用シナリオを取得（status='available'のみ、必要なフィールドのみ）
  // organizationId: 指定した場合そのIDを使用、未指定の場合はログインユーザーの組織で自動フィルタ
  async getPublic(organizationId?: string): Promise<Partial<Scenario>[]> {
    let query = supabase
      .from('organization_scenarios_with_master')
      .select('id, title, key_visual_url, author, duration, player_count_min, player_count_max, genre, release_date, status, participation_fee, scenario_type, organization_id')
      .eq('status', 'available')
    
    const orgId = organizationId || await getCurrentOrganizationId()
    if (orgId) {
      query = query.eq('organization_id', orgId)
    }
    
    const { data, error } = await query.order('title', { ascending: true })
    
    if (error) throw error
    return data || []
  },

  // IDでシナリオを取得（scenario_master_id で検索）
  // organizationId: 指定した場合そのIDを使用、未指定の場合はログインユーザーの組織で自動フィルタ
  // 自組織で見つからない場合は組織を問わず検索（他組織の共有シナリオ対応）
  async getById(id: string, organizationId?: string): Promise<Scenario | null> {
    const orgId = organizationId || await getCurrentOrganizationId()

    if (orgId) {
      const { data, error } = await supabase
        .from('organization_scenarios_with_master')
        .select(ORG_SCENARIOS_VIEW_SELECT_FIELDS)
        .eq('id', id)
        .eq('organization_id', orgId)
        .maybeSingle()

      if (!error && data) {
        return data as unknown as Scenario
      }
    }

    const { data, error } = await supabase
      .from('organization_scenarios_with_master')
      .select(ORG_SCENARIOS_VIEW_SELECT_FIELDS)
      .eq('id', id)
      .limit(1)

    if (error) throw error
    return (data?.[0] as unknown as Scenario) || null
  },

  // slugでシナリオを取得
  // 自組織で見つからない場合は組織を問わず検索（他組織の共有シナリオ対応）
  async getBySlug(slug: string, organizationId?: string): Promise<Scenario | null> {
    const orgId = organizationId || await getCurrentOrganizationId()

    if (orgId) {
      const { data, error } = await supabase
        .from('organization_scenarios_with_master')
        .select(ORG_SCENARIOS_VIEW_SELECT_FIELDS)
        .eq('slug', slug)
        .eq('organization_id', orgId)
        .maybeSingle()

      if (!error && data) {
        return data as unknown as Scenario
      }
    }

    const { data, error } = await supabase
      .from('organization_scenarios_with_master')
      .select(ORG_SCENARIOS_VIEW_SELECT_FIELDS)
      .eq('slug', slug)
      .limit(1)

    if (error) throw error
    return (data?.[0] as unknown as Scenario) || null
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

  // ページネーション対応：シナリオを取得
  async getPaginated(page: number = 0, pageSize: number = 20, organizationId?: string): Promise<PaginatedResponse<Scenario>> {
    const from = page * pageSize
    const to = from + pageSize - 1
    
    let query = supabase
      .from('organization_scenarios_with_master')
      .select(ORG_SCENARIOS_VIEW_SELECT_FIELDS, { count: 'exact' })
    
    const orgId = organizationId || await getCurrentOrganizationId()
    if (orgId) {
      query = query.eq('organization_id', orgId)
    }
    
    const { data, error, count } = await query
      .order('title', { ascending: true })
      .range(from, to)
    
    if (error) throw error
    
    return {
      data: (data || []) as unknown as Scenario[],
      count: count || 0,
      hasMore: count ? (from + pageSize) < count : false
    }
  },

  // シナリオを作成
  // scenario_masters + organization_scenarios に保存
  async create(scenario: Omit<Scenario, 'id' | 'created_at' | 'updated_at'>): Promise<Scenario> {
    const organizationId = await getCurrentOrganizationId()
    if (!organizationId) {
      throw new Error('組織IDが取得できません')
    }
    
    logger.log('📝 シナリオ作成開始')
    
    // ========================================
    // STEP 1: scenario_masters に追加
    // ========================================
    const { data: masterData, error: masterError } = await supabase
      .from('scenario_masters')
      .insert({
        title: scenario.title,
        author: scenario.author || null,
        author_email: scenario.author_email || null,
        description: scenario.description || null,
        synopsis: scenario.synopsis || null,
        player_count_min: scenario.player_count_min || 4,
        player_count_max: scenario.player_count_max || 6,
        official_duration: scenario.duration || 180,
        weekend_duration: scenario.weekend_duration || null,
        genre: scenario.genre || [],
        difficulty: scenario.difficulty ? String(scenario.difficulty) : null,
        key_visual_url: scenario.key_visual_url || null,
        has_pre_reading: scenario.has_pre_reading || false,
        release_date: scenario.release_date || null,
        official_site_url: scenario.official_site_url || null,
        master_status: 'draft',
        submitted_by_organization_id: organizationId,
      })
      .select()
      .single()

    if (masterError) {
      logger.error('scenario_masters作成エラー:', masterError)
      throw masterError
    }
    
    const scenarioMasterId = masterData.id
    logger.log('✅ scenario_masters作成成功:', scenarioMasterId)

    // ========================================
    // STEP 2: organization_scenarios に追加
    // ========================================
    const orgStatus = scenario.status === 'available' ? 'available' : 'unavailable'
    
    const { data: orgData, error: orgScenarioError } = await supabase
      .from('organization_scenarios')
      .insert({
        organization_id: organizationId,
        scenario_master_id: scenarioMasterId,
        slug: scenario.slug || null,
        duration: scenario.duration || null,
        participation_fee: scenario.participation_fee || null,
        gm_test_participation_fee: scenario.gm_test_participation_fee || null,
        extra_preparation_time: scenario.extra_preparation_time ?? null,
        org_status: orgStatus,
        license_amount: scenario.license_amount || null,
        gm_test_license_amount: scenario.gm_test_license_amount || null,
        franchise_license_amount: scenario.franchise_license_amount || null,
        franchise_gm_test_license_amount: scenario.franchise_gm_test_license_amount || null,
        gm_count: scenario.gm_count || null,
        gm_costs: scenario.gm_costs || [],
        gm_assignments: scenario.gm_assignments || null,
        available_gms: scenario.available_gms || [],
        experienced_staff: scenario.experienced_staff || [],
        available_stores: scenario.available_stores || [],
        production_cost: scenario.production_cost || null,
        production_costs: scenario.production_costs || [],
        depreciation_per_performance: scenario.depreciation_per_performance || null,
        play_count: scenario.play_count || 0,
        notes: scenario.notes || null,
      })
      .select()
      .single()

    if (orgScenarioError) {
      logger.error('organization_scenarios作成エラー:', orgScenarioError)
      // マスターは作成済みなので、organization_scenariosの作成失敗はロールバックしない
      throw orgScenarioError
    }
    
    logger.log('✅ organization_scenarios作成成功:', orgData?.id)
    
    // organization_scenarios_with_master ビューから作成したデータを取得して返す
    const { data: createdScenario, error: fetchError } = await supabase
      .from('organization_scenarios_with_master')
      .select(ORG_SCENARIOS_VIEW_SELECT_FIELDS)
      .eq('id', scenarioMasterId)
      .eq('organization_id', organizationId)
      .single()
    
    if (fetchError) {
      logger.error('作成後のシナリオ取得エラー:', fetchError)
      throw fetchError
    }
    
    logger.log('✅ シナリオ作成完了')
    return createdScenario as unknown as Scenario
  },

  // シナリオを更新
  // id: scenario_master_id として検索（organization_scenarios_with_master のid = scenario_master_id）
  async update(id: string, updates: Partial<Scenario>): Promise<Scenario> {
    logger.log('📝 シナリオ更新:', id, Object.keys(updates))
    
    const orgId = await getCurrentOrganizationId()
    if (!orgId) {
      throw new Error('組織IDが取得できません')
    }
    
    // 対象のorganization_scenariosを特定
    const { data: orgScenario } = await supabase
      .from('organization_scenarios')
      .select('id, scenario_master_id')
      .eq('scenario_master_id', id)
      .eq('organization_id', orgId)
      .maybeSingle()
    
    if (!orgScenario) {
      throw new Error('シナリオが見つかりません')
    }
    
    // organization_scenarios 用のデータを構築
    const orgScenarioData: Record<string, unknown> = {}
    
    // statusはorg_statusにマッピング
    if (updates.status) {
      const validOrgStatuses = ['available', 'unavailable', 'coming_soon']
      if (validOrgStatuses.includes(updates.status)) {
        orgScenarioData.org_status = updates.status
      }
    }
    
    // 組織固有カラムをマッピング
    const directOrgColumns = [
      'slug', 'duration', 'participation_fee', 'gm_test_participation_fee',
      'extra_preparation_time', 'license_amount', 'gm_test_license_amount',
      'franchise_license_amount', 'franchise_gm_test_license_amount',
      'available_gms', 'experienced_staff', 'available_stores',
      'gm_costs', 'gm_count', 'gm_assignments',
      'production_cost', 'production_costs', 'depreciation_per_performance',
      'play_count', 'notes', 'participation_costs', 'flexible_pricing', 'use_flexible_pricing'
    ]
    
    for (const col of directOrgColumns) {
      if (updates[col as keyof Scenario] !== undefined) {
        orgScenarioData[col] = updates[col as keyof Scenario]
      }
    }
    
    // override フィールド（マスター情報の組織固有上書き）
    const overrideMapping: Record<string, string> = {
      'title': 'override_title',
      'author': 'override_author',
      'genre': 'override_genre',
      'difficulty': 'override_difficulty',
      'player_count_min': 'override_player_count_min',
      'player_count_max': 'override_player_count_max',
    }
    
    for (const [scenarioCol, orgCol] of Object.entries(overrideMapping)) {
      if (updates[scenarioCol as keyof Scenario] !== undefined) {
        orgScenarioData[orgCol] = updates[scenarioCol as keyof Scenario]
      }
    }
    
    // custom フィールド
    const customMapping: Record<string, string> = {
      'key_visual_url': 'custom_key_visual_url',
      'description': 'custom_description',
      'synopsis': 'custom_synopsis',
      'caution': 'custom_caution',
    }
    
    for (const [scenarioCol, orgCol] of Object.entries(customMapping)) {
      if (updates[scenarioCol as keyof Scenario] !== undefined) {
        orgScenarioData[orgCol] = updates[scenarioCol as keyof Scenario]
      }
    }
    
    // organization_scenarios を更新
    if (Object.keys(orgScenarioData).length > 0) {
      orgScenarioData.updated_at = new Date().toISOString()
      logger.log('📝 organization_scenarios更新:', Object.keys(orgScenarioData))
      
      const { error: orgError } = await supabase
        .from('organization_scenarios')
        .update(orgScenarioData)
        .eq('id', orgScenario.id)
      
      if (orgError) {
        logger.error('organization_scenarios更新エラー:', orgError)
        throw orgError
      }
    }
    
    // 組織が「公開中」にした場合、マスターがdraftならpendingに昇格
    if (updates.status === 'available') {
      const { data: masterData } = await supabase
        .from('scenario_masters')
        .select('id, master_status')
        .eq('id', id)
        .maybeSingle()
      
      if (masterData && masterData.master_status === 'draft') {
        logger.log('📝 マスターをdraft→pendingに昇格:', id)
        await supabase
          .from('scenario_masters')
          .update({ master_status: 'pending', updated_at: new Date().toISOString() })
          .eq('id', id)
      }
    }
    
    // 更新後のデータを取得して返す
    const { data: updatedScenario, error: fetchError } = await supabase
      .from('organization_scenarios_with_master')
      .select(ORG_SCENARIOS_VIEW_SELECT_FIELDS)
      .eq('id', id)
      .eq('organization_id', orgId)
      .single()
    
    if (fetchError) {
      logger.error('更新後のシナリオ取得エラー:', fetchError)
      throw fetchError
    }
    
    logger.log('✅ シナリオ更新完了')
    return updatedScenario as unknown as Scenario
  },

  // シナリオを削除（organization_scenarios のみ削除、scenario_masters は残す）
  // id: scenario_master_id
  async delete(id: string): Promise<void> {
    const orgId = await getCurrentOrganizationId()
    if (!orgId) {
      throw new Error('組織IDが取得できません')
    }
    
    logger.log('📝 シナリオ削除:', id)
    
    // 関連データの参照をクリア（scenario_master_id を使用）
    
    // 1. reservationsのscenario_master_idをNULLに設定
    // eslint-disable-next-line no-restricted-syntax -- シナリオ削除時の関連データクリアのため直接更新が必要
    const { error: reservationError } = await supabase
      .from('reservations')
      .update({ scenario_master_id: null })
      .eq('scenario_master_id', id)
      .eq('organization_id', orgId)
    
    if (reservationError) {
      logger.error('reservations更新エラー:', reservationError)
    }
    
    // 2. schedule_eventsのscenario_master_idをNULLに設定
    const { error: scheduleError } = await supabase
      .from('schedule_events')
      .update({ scenario_master_id: null })
      .eq('scenario_master_id', id)
      .eq('organization_id', orgId)
    
    if (scheduleError) {
      logger.error('schedule_events更新エラー:', scheduleError)
    }
    
    // 3. staff_scenario_assignmentsの削除
    const { error: assignmentError } = await supabase
      .from('staff_scenario_assignments')
      .delete()
      .eq('scenario_id', id)
      .eq('organization_id', orgId)
    
    if (assignmentError) {
      logger.error('staff_scenario_assignments削除エラー:', assignmentError)
    }
    
    // 4. performance_kitsの削除（scenario_master_id を使用）
    const { error: kitsError } = await supabase
      .from('performance_kits')
      .delete()
      .eq('scenario_master_id', id)
    
    if (kitsError) {
      logger.error('performance_kits削除エラー:', kitsError)
    }
    
    // NOTE: staff.special_scenarios への同期は廃止
    // staff_scenario_assignments が唯一のデータソース（既に削除済み）
    
    // 5. organization_scenarios を削除（scenario_masters は残す）
    const { error } = await supabase
      .from('organization_scenarios')
      .delete()
      .eq('scenario_master_id', id)
      .eq('organization_id', orgId)
    
    if (error) {
      logger.error('organization_scenarios削除エラー:', error)
      throw error
    }
    
    logger.log('✅ シナリオ削除完了（organization_scenariosのみ）')
  },

  // シナリオの担当GMを更新
  async updateAvailableGms(id: string, availableGms: string[]): Promise<Scenario> {
    const orgId = await getCurrentOrganizationId()
    if (!orgId) {
      throw new Error('組織IDが取得できません')
    }
    
    const { error } = await supabase
      .from('organization_scenarios')
      .update({ available_gms: availableGms, updated_at: new Date().toISOString() })
      .eq('scenario_master_id', id)
      .eq('organization_id', orgId)
    
    if (error) throw error
    
    // 更新後のデータを取得して返す
    const { data, error: fetchError } = await supabase
      .from('organization_scenarios_with_master')
      .select(ORG_SCENARIOS_VIEW_SELECT_FIELDS)
      .eq('id', id)
      .eq('organization_id', orgId)
      .single()
    
    if (fetchError) throw fetchError
    return data as unknown as Scenario
  },

  // シナリオの累計公演回数を取得
  // scenarioId: scenario_master_id
  async getPerformanceCount(scenarioId: string): Promise<number> {
    const orgId = await getCurrentOrganizationId()
    
    let query = supabase
      .from('schedule_events')
      .select('*', { count: 'exact', head: true })
      .eq('scenario_master_id', scenarioId)
      .not('status', 'eq', 'cancelled')
    
    if (orgId) {
      query = query.eq('organization_id', orgId)
    }
    
    const { count, error } = await query
    
    if (error) throw error
    return count || 0
  },

  // シナリオの統計情報を取得（公演回数、中止回数、売上、利益など）
  // 今日までの公演のみ計算（未来の公演は含めない）
  // scenarioId は scenarios.id または scenario_master_id のどちらでも対応
  async getScenarioStats(scenarioId: string): Promise<{
    performanceCount: number
    cancelledCount: number
    totalRevenue: number
    totalParticipants: number
    totalStaffParticipants: number
    totalGmCost: number
    totalLicenseCost: number
    firstPerformanceDate: string | null
    performanceDates: Array<{ date: string; category: string; participants: number; demoParticipants: number; staffParticipants: number; revenue: number; startTime: string; storeId: string | null; isCancelled: boolean }>
    futurePerformanceCount: number  // 将来の公演予定数
    futureReservationCount: number  // 将来の貸切予約数（公演に紐付いていない）
  }> {
    // 今日の日付（YYYY-MM-DD形式）
    const today = new Date().toISOString().split('T')[0]
    
    // 組織フィルタ（マルチテナント対応）
    const orgId = await getCurrentOrganizationId()
    
    logger.log('📊 getScenarioStats: scenario_master_id =', scenarioId)

    // シナリオの最大参加者数とライセンス料を取得（organization_scenarios_with_master から）
    let scenarioQuery = supabase
      .from('organization_scenarios_with_master')
      .select('player_count_max, license_amount, gm_test_license_amount, license_rewards')
      .eq('id', scenarioId)
    
    if (orgId) {
      scenarioQuery = scenarioQuery.eq('organization_id', orgId)
    }
    
    const { data: scenarioData } = await scenarioQuery.maybeSingle()
    const maxParticipants = scenarioData?.player_count_max || 99
    const defaultLicenseAmount = scenarioData?.license_amount || 0
    const defaultGmTestLicenseAmount = scenarioData?.gm_test_license_amount || 0
    const licenseRewards = scenarioData?.license_rewards as Array<{ item: string; amount: number }> | undefined
    const normalLicenseFromRewards = licenseRewards?.find(r => r.item === 'normal')?.amount
    const gmTestLicenseFromRewards = licenseRewards?.find(r => r.item === 'gmtest')?.amount
    const normalLicenseAmount = normalLicenseFromRewards ?? defaultLicenseAmount
    const gmTestLicenseAmount = gmTestLicenseFromRewards ?? defaultGmTestLicenseAmount

    // 公演回数（中止以外、今日まで、出張公演除外）- scenario_master_id で検索
    let perfQuery = supabase
      .from('schedule_events')
      .select('*', { count: 'exact', head: true })
      .eq('scenario_master_id', scenarioId)
      .lte('date', today)
      .neq('category', 'offsite')
      .neq('is_cancelled', true)
    
    if (orgId) {
      perfQuery = perfQuery.eq('organization_id', orgId)
    }
    
    const { count: performanceCount, error: perfError } = await perfQuery
    
    if (perfError) throw perfError

    // 中止回数（今日まで、出張公演除外）
    let cancelQuery = supabase
      .from('schedule_events')
      .select('*', { count: 'exact', head: true })
      .eq('scenario_master_id', scenarioId)
      .lte('date', today)
      .neq('category', 'offsite')
      .eq('is_cancelled', true)
    
    if (orgId) {
      cancelQuery = cancelQuery.eq('organization_id', orgId)
    }
    
    const { count: cancelledCount, error: cancelError } = await cancelQuery
    
    if (cancelError) throw cancelError

    // 初公演日を取得（今日までの公演から、中止以外、出張公演除外）
    let firstQuery = supabase
      .from('schedule_events')
      .select('date, scenario_master_id')
      .eq('scenario_master_id', scenarioId)
      .lte('date', today)
      .neq('category', 'offsite')
      .neq('is_cancelled', true)
      .order('date', { ascending: true })
      .limit(1)
    
    if (orgId) {
      firstQuery = firstQuery.eq('organization_id', orgId)
    }
    
    const { data: firstEvent, error: firstError } = await firstQuery.single()
    
    const firstPerformanceDate = firstError ? null : firstEvent?.date || null

    // 公演イベントを取得して売上・コストを集計（今日まで、出張公演除外）
    // ※ 中止公演もリスト表示のため取得（サマリー計算からは除外）
    let eventsQuery = supabase
      .from('schedule_events')
      .select('id, date, category, current_participants, total_revenue, gm_cost, license_cost, start_time, store_id, is_cancelled')
      .eq('scenario_master_id', scenarioId)
      .lte('date', today)
      .neq('category', 'offsite')
      .order('date', { ascending: false })
    
    if (orgId) {
      eventsQuery = eventsQuery.eq('organization_id', orgId)
    }
    
    const { data: events, error: eventsError } = await eventsQuery
    
    if (eventsError) throw eventsError

    // 各イベントの予約情報を取得（実際の予約から参加者数を計算）
    const eventIds = events?.map(e => e.id) || []
    const demoParticipantsMap: Record<string, number> = {}
    const actualParticipantsMap: Record<string, number> = {}
    const staffParticipantsMap: Record<string, number> = {}
    
    if (eventIds.length > 0) {
      // PostgREST URL長制限回避: IDをバッチに分割してクエリ
      const BATCH_SIZE = 100
      const allReservations: Array<{ schedule_event_id: string; participant_count: number; reservation_source: string | null; payment_method: string | null }> = []
      
      for (let i = 0; i < eventIds.length; i += BATCH_SIZE) {
        const batchIds = eventIds.slice(i, i + BATCH_SIZE)
        let resQuery = supabase
          .from('reservations')
          .select('schedule_event_id, participant_count, reservation_source, payment_method')
          .in('schedule_event_id', batchIds)
          .in('status', ['confirmed', 'gm_confirmed'])
        
        if (orgId) {
          resQuery = resQuery.eq('organization_id', orgId)
        }
        
        const { data, error: resError } = await resQuery
        if (!resError && data) {
          allReservations.push(...(data as typeof allReservations))
        }
      }
      
      allReservations.forEach(res => {
        if (res.schedule_event_id) {
          const count = res.participant_count || 0
          
          // デモ予約
          if (res.reservation_source === 'demo' || res.reservation_source === 'demo_auto') {
            demoParticipantsMap[res.schedule_event_id] = 
              (demoParticipantsMap[res.schedule_event_id] || 0) + count
          }
          // スタッフ参加
          else if (res.reservation_source === 'staff_entry' || 
                   res.reservation_source === 'staff_participation' || 
                   res.payment_method === 'staff') {
            staffParticipantsMap[res.schedule_event_id] = 
              (staffParticipantsMap[res.schedule_event_id] || 0) + count
          }
          // 通常予約（有料）
          else {
            actualParticipantsMap[res.schedule_event_id] = 
              (actualParticipantsMap[res.schedule_event_id] || 0) + count
          }
        }
      })
    }

    // 集計
    let totalRevenue = 0
    let totalParticipants = 0
    let totalStaffParticipants = 0
    let totalGmCost = 0
    let totalLicenseCost = 0
    const performanceDates: Array<{ date: string; category: string; participants: number; demoParticipants: number; staffParticipants: number; revenue: number; startTime: string; storeId: string | null; isCancelled: boolean }> = []

    events?.forEach(event => {
      const isCancelled = event.is_cancelled === true
      const demoCount = demoParticipantsMap[event.id] || 0
      const staffCount = staffParticipantsMap[event.id] || 0
      const actualCount = actualParticipantsMap[event.id] || 0
      
      // 参加者数: 予約データがあればそれを使用、なければ current_participants を使用
      // （予約データがない過去の公演では current_participants に直接入力されている）
      // ※ スタッフ参加は有料参加者に含めない（actualCount + demoCount のみ）
      const reservationParticipants = actualCount + demoCount
      const rawParticipants = reservationParticipants > 0 
        ? reservationParticipants 
        : (event.current_participants || 0)
      
      // 最大参加者数を超えないように制限
      const participants = Math.min(rawParticipants, maxParticipants)
      
      // サマリー計算は中止公演を除外
      if (!isCancelled) {
        totalParticipants += participants
        totalStaffParticipants += staffCount
        totalRevenue += event.total_revenue || 0
        totalGmCost += event.gm_cost || 0
        
        // ライセンス料の計算: event.license_cost が0または未設定の場合はシナリオの設定値から計算
        let licenseCost = event.license_cost || 0
        if (licenseCost === 0) {
          // カテゴリに応じて適切なライセンス料を設定
          const isGmTest = event.category === 'gmtest'
          licenseCost = isGmTest ? gmTestLicenseAmount : normalLicenseAmount
        }
        totalLicenseCost += licenseCost
      }
      
      // リスト表示用には中止公演も含める
      performanceDates.push({
        date: event.date,
        category: event.category || 'open',
        participants,  // 参加者数
        demoParticipants: demoCount,  // 内訳用に保持
        staffParticipants: staffCount,  // スタッフ参加者数
        revenue: event.total_revenue || 0,
        startTime: event.start_time || '',
        storeId: event.store_id || null,
        isCancelled
      })
    })

    // 将来の公演予定数（明日以降、出張公演除外、中止除外）
    let futurePerfQuery = supabase
      .from('schedule_events')
      .select('*', { count: 'exact', head: true })
      .eq('scenario_master_id', scenarioId)
      .gt('date', today)
      .neq('category', 'offsite')
      .neq('is_cancelled', true)
    
    if (orgId) {
      futurePerfQuery = futurePerfQuery.eq('organization_id', orgId)
    }
    
    const { count: futurePerformanceCount } = await futurePerfQuery

    // 将来の貸切予約数（公演に紐付いていない、確定済み）
    let futureResQuery = supabase
      .from('reservations')
      .select('*', { count: 'exact', head: true })
      .eq('scenario_master_id', scenarioId)
      .is('schedule_event_id', null)
      .in('status', ['confirmed', 'gm_confirmed', 'pending'])
    
    if (orgId) {
      futureResQuery = futureResQuery.eq('organization_id', orgId)
    }
    
    const { count: futureReservationCount } = await futureResQuery

    // デバッグログ（本番では削除可）
    logger.log('📊 シナリオ統計:', {
      scenarioId,
      maxParticipants,
      performanceCount: performanceCount || 0,
      totalParticipants,
      futurePerformanceCount: futurePerformanceCount || 0,
      futureReservationCount: futureReservationCount || 0,
    })

    return {
      performanceCount: performanceCount || 0,
      cancelledCount: cancelledCount || 0,
      totalRevenue,
      totalParticipants,
      totalStaffParticipants,
      totalGmCost,
      totalLicenseCost,
      firstPerformanceDate,
      performanceDates,
      futurePerformanceCount: futurePerformanceCount || 0,
      futureReservationCount: futureReservationCount || 0
    }
  },

  // 全シナリオの統計情報を一括取得（リスト表示用、ページネーションで全件取得）
  async getAllScenarioStats(): Promise<Record<string, {
    performanceCount: number
    cancelledCount: number
    totalRevenue: number
  }>> {
    const today = new Date().toISOString().split('T')[0]
    
    // 組織フィルタ（マルチテナント対応）
    const orgId = await getCurrentOrganizationId()

    // ページネーションで全件取得（Supabaseのmax_rows制限を回避）
    const pageSize = 1000
    let allEvents: any[] = []
    let page = 0
    let hasMore = true

    while (hasMore) {
      const from = page * pageSize
      const to = from + pageSize - 1
      
      let query = supabase
        .from('schedule_events')
        .select('scenario_id, is_cancelled, total_revenue, date, category')
        .lte('date', today)
        .neq('category', 'offsite')
        .range(from, to)
        .order('date', { ascending: false })
      
      if (orgId) {
        query = query.eq('organization_id', orgId)
      }
      
      const { data: events, error } = await query

      if (error) throw error

      if (events && events.length > 0) {
        allEvents = allEvents.concat(events)
        hasMore = events.length === pageSize
        page++
      } else {
        hasMore = false
      }
    }

    const events = allEvents

    // scenario_idごとに集計
    const statsMap: Record<string, {
      performanceCount: number
      cancelledCount: number
      totalRevenue: number
    }> = {}

    events?.forEach(event => {
      if (!event.scenario_id) return

      if (!statsMap[event.scenario_id]) {
        statsMap[event.scenario_id] = {
          performanceCount: 0,
          cancelledCount: 0,
          totalRevenue: 0
        }
      }

      if (event.is_cancelled) {
        statsMap[event.scenario_id].cancelledCount++
      } else {
        statsMap[event.scenario_id].performanceCount++
        statsMap[event.scenario_id].totalRevenue += event.total_revenue || 0
      }
    })

    return statsMap
  },

  // シナリオの担当GMを更新
  // NOTE: staff.special_scenarios への同期は廃止。staff_scenario_assignments が唯一のデータソース
  // id: scenario_master_id
  async updateAvailableGmsWithSync(id: string, availableGms: string[]): Promise<Scenario> {
    const orgId = await getCurrentOrganizationId()
    if (!orgId) {
      throw new Error('組織IDが取得できません')
    }
    
    // organization_scenarios の担当GMを更新
    const { error: updateError } = await supabase
      .from('organization_scenarios')
      .update({ available_gms: availableGms, updated_at: new Date().toISOString() })
      .eq('scenario_master_id', id)
      .eq('organization_id', orgId)
    
    if (updateError) throw updateError

    // 更新後のデータを取得して返す
    const { data: updatedScenario, error: fetchError } = await supabase
      .from('organization_scenarios_with_master')
      .select(ORG_SCENARIOS_VIEW_SELECT_FIELDS)
      .eq('id', id)
      .eq('organization_id', orgId)
      .single()
    
    if (fetchError) throw fetchError
    return updatedScenario as unknown as Scenario
  }
}


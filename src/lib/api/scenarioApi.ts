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

/**
 * 渡されたIDから対応するシナリオID（scenarios.id）のリストを取得
 * IDは scenarios.id または scenario_master_id のどちらでも対応
 * @param idOrMasterId - scenarios.id または scenario_master_id
 * @returns scenarios.id のリスト（同じscenario_master_idを持つシナリオ全て）
 */
async function resolveScenarioIds(idOrMasterId: string): Promise<string[]> {
  // まず、渡されたIDが scenarios.id として存在するか確認
  const { data: directMatch } = await supabase
    .from('scenarios')
    .select('id, scenario_master_id')
    .eq('id', idOrMasterId)
    .single()
  
  if (directMatch) {
    // scenarios.id として存在する場合、同じscenario_master_idを持つ全シナリオを取得
    if (directMatch.scenario_master_id) {
      const { data: siblings } = await supabase
        .from('scenarios')
        .select('id')
        .eq('scenario_master_id', directMatch.scenario_master_id)
      return siblings?.map(s => s.id) || [idOrMasterId]
    }
    return [idOrMasterId]
  }
  
  // scenarios.id として存在しない場合、scenario_master_id として検索
  const { data: byMaster } = await supabase
    .from('scenarios')
    .select('id')
    .eq('scenario_master_id', idOrMasterId)
  
  if (byMaster && byMaster.length > 0) {
    return byMaster.map(s => s.id)
  }
  
  // どちらにも見つからない場合は元のIDを返す（フォールバック）
  return [idOrMasterId]
}

/**
 * DBに存在するscenariosテーブルのカラム一覧
 * UI専用フィールドは含めない（DBに送信するとエラーになるため）
 */
const DB_SCENARIO_COLUMNS = [
  'title',
  'slug',
  'description',
  'author',
  'author_email',
  'report_display_name',
  'duration',
  'weekend_duration',
  'player_count_min',
  'player_count_max',
  'male_count',
  'female_count',
  'other_count',
  'difficulty',
  'rating',
  'status',
  'scenario_type',
  'participation_fee',
  'participation_costs',
  'gm_costs',
  'license_amount',
  'gm_test_license_amount',
  'franchise_license_amount',
  'franchise_gm_test_license_amount',
  'external_license_amount',
  'external_gm_test_license_amount',
  'genre',
  'has_pre_reading',
  'key_visual_url',
  'notes',
  'required_props',
  'production_costs',
  'kit_count',
  'gm_count',
  'available_stores',
  'scenario_master_id',
  'organization_id',
  'is_shared',
  'extra_preparation_time',
  'available_gms', // 配列カラム
  'play_count',
] as const

/**
 * Scenarioオブジェクトから、DBに存在するカラムのみを抽出する
 * UI専用フィールド（experienced_staff, use_flexible_pricing, flexible_pricing, etc.）は除外される
 */
function extractDbColumns(scenario: Partial<Scenario>): Record<string, unknown> {
  const result: Record<string, unknown> = {}
  
  for (const key of DB_SCENARIO_COLUMNS) {
    if (key in scenario && scenario[key as keyof Scenario] !== undefined) {
      result[key] = scenario[key as keyof Scenario]
    }
  }
  
  return result
}

// scenarios テーブル廃止フラグ（true にすると scenarios_v2 ビューを使用）
const USE_SCENARIOS_V2 = false

// scenarios_v2 ビュー用のSELECTフィールド
const SCENARIOS_V2_SELECT_FIELDS = 
  'id, org_scenario_id, organization_id, scenario_master_id, slug, status, participation_fee, participation_costs, gm_costs, gm_count, gm_assignments, extra_preparation_time, available_stores, available_gms, experienced_staff, license_amount, gm_test_license_amount, franchise_license_amount, franchise_gm_test_license_amount, production_cost, production_costs, depreciation_per_performance, play_count, notes, created_at, updated_at, title, author, author_email, author_id, key_visual_url, description, synopsis, caution, player_count_min, player_count_max, duration, genre, difficulty, has_pre_reading, release_date, official_site_url, required_props, master_status, is_shared, scenario_type, rating, kit_count' as const

export const scenarioApi = {
  // 全シナリオを取得
  // organizationId: 指定した場合そのIDを使用、未指定の場合はログインユーザーの組織で自動フィルタ
  // skipOrgFilter: trueの場合、組織フィルタをスキップ（全組織のデータを取得）
  async getAll(organizationId?: string, skipOrgFilter?: boolean): Promise<Scenario[]> {
    const tableName = USE_SCENARIOS_V2 ? 'scenarios_v2' : 'scenarios'
    const selectFields = USE_SCENARIOS_V2 ? SCENARIOS_V2_SELECT_FIELDS : SCENARIO_SELECT_FIELDS
    
    let query = supabase
      .from(tableName)
      .select(selectFields)
    
    // 組織フィルタリング
    if (!skipOrgFilter) {
      // organizationIdが指定されていない場合、現在のユーザーの組織を自動取得
      const orgId = organizationId || await getCurrentOrganizationId()
      logger.log('🏢 シナリオ取得: organization_id =', orgId)
      if (orgId) {
        query = query.or(`organization_id.eq.${orgId},is_shared.eq.true`)
      } else {
        logger.log('⚠️ organization_idがnullのため、フィルタなしで取得')
      }
    }
    
    const { data, error } = await query.order('title', { ascending: true })
    
    if (error) throw error
    return data || []
  },

  // 公開用シナリオを取得（status='available'のみ、必要なフィールドのみ）
  // organizationId: 指定した場合そのIDを使用、未指定の場合はログインユーザーの組織で自動フィルタ
  async getPublic(organizationId?: string): Promise<Partial<Scenario>[]> {
    let query = supabase
      .from('scenarios')
      .select('id, title, key_visual_url, author, duration, player_count_min, player_count_max, genre, release_date, status, participation_fee, scenario_type, organization_id, is_shared')
      .eq('status', 'available')
      .neq('scenario_type', 'gm_test') // GMテストを除外
    
    // organizationIdが指定されていない場合、現在のユーザーの組織を自動取得
    const orgId = organizationId || await getCurrentOrganizationId()
    if (orgId) {
      query = query.or(`organization_id.eq.${orgId},is_shared.eq.true`)
    }
    
    const { data, error } = await query.order('title', { ascending: true })
    
    if (error) throw error
    return data || []
  },

  // IDでシナリオを取得
  // organizationId: 指定した場合そのIDを使用、未指定の場合はログインユーザーの組織で自動フィルタ
  // 公開シナリオ（status='available'）は常に表示可能
  async getById(id: string, organizationId?: string): Promise<Scenario | null> {
    let query = supabase
      .from('scenarios')
      .select(SCENARIO_SELECT_FIELDS)
      .eq('id', id)
    
    // organizationIdが指定されていない場合、現在のユーザーの組織を自動取得
    const orgId = organizationId || await getCurrentOrganizationId()
    if (orgId) {
      // 公開シナリオ（status='available'）も含める
      query = query.or(`organization_id.eq.${orgId},is_shared.eq.true,status.eq.available`)
    }
    
    const { data, error } = await query.single()
    
    if (error) {
      if (error.code === 'PGRST116') {
        return null // レコードが見つからない
      }
      throw error
    }
    return data
  },

  // slugでシナリオを取得
  // 公開シナリオ（status='available'）は常に表示可能
  async getBySlug(slug: string, organizationId?: string): Promise<Scenario | null> {
    let query = supabase
      .from('scenarios')
      .select(SCENARIO_SELECT_FIELDS)
      .eq('slug', slug)
    
    // organizationIdが指定されていない場合、現在のユーザーの組織を自動取得
    const orgId = organizationId || await getCurrentOrganizationId()
    if (orgId) {
      // 公開シナリオ（status='available'）も含める
      query = query.or(`organization_id.eq.${orgId},is_shared.eq.true,status.eq.available`)
    }
    
    const { data, error } = await query.single()
    
    if (error) {
      if (error.code === 'PGRST116') {
        return null // レコードが見つからない
      }
      throw error
    }
    return data
  },

  // IDまたはslugでシナリオを取得（slugを優先、見つからなければIDで検索）
  async getByIdOrSlug(idOrSlug: string, organizationId?: string): Promise<Scenario | null> {
    // UUIDパターンかどうかをチェック
    const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    const isUuid = uuidPattern.test(idOrSlug)
    
    // UUIDの場合はIDで検索
    if (isUuid) {
      return this.getById(idOrSlug, organizationId)
    }
    
    // slugで検索
    const bySlug = await this.getBySlug(idOrSlug, organizationId)
    if (bySlug) return bySlug
    
    // slugで見つからなければIDでも試す（後方互換）
    return this.getById(idOrSlug, organizationId)
  },

  // ページネーション対応：シナリオを取得
  async getPaginated(page: number = 0, pageSize: number = 20): Promise<PaginatedResponse<Scenario>> {
    const from = page * pageSize
    const to = from + pageSize - 1
    
    // データ取得とカウントを同時に実行
    const { data, error, count } = await supabase
      .from('scenarios')
      .select('*', { count: 'exact' })
      .order('title', { ascending: true })
      .range(from, to)
    
    if (error) throw error
    
    return {
      data: data || [],
      count: count || 0,
      hasMore: count ? (from + pageSize) < count : false
    }
  },

  // シナリオを作成
  // 旧UIと新UI両方で表示されるよう、3つのテーブルに保存
  async create(scenario: Omit<Scenario, 'id' | 'created_at' | 'updated_at'>): Promise<Scenario> {
    // organization_idを自動取得（マルチテナント対応）
    const organizationId = await getCurrentOrganizationId()
    
    // DBに存在するカラムのみを抽出（UI専用フィールドを除外）
    const dbData = extractDbColumns(scenario)
    dbData.organization_id = organizationId
    
    logger.log('📝 シナリオ作成データ:', Object.keys(dbData))
    
    // ========================================
    // STEP 1: scenario_masters に追加（新UI用）
    // ========================================
    let scenarioMasterId: string | null = null
    try {
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
          master_status: 'draft', // 組織から作成はdraft
          submitted_by_organization_id: organizationId,
        })
        .select()
        .single()

      if (masterError) {
        logger.error('scenario_masters作成エラー:', masterError)
        // マスタ作成失敗しても旧テーブルには保存を続行
      } else {
        scenarioMasterId = masterData.id
        logger.log('✅ scenario_masters作成成功:', scenarioMasterId)
      }
    } catch (err) {
      logger.error('scenario_masters作成で例外:', err)
    }

    // ========================================
    // STEP 2: organization_scenarios に追加（新UI用）
    // ========================================
    if (scenarioMasterId && organizationId) {
      // ステータスの決定（available/unavailable）
      const orgStatus = scenario.status === 'available' ? 'available' : 'unavailable'
      logger.log('📋 organization_scenarios作成開始:', {
        scenario_master_id: scenarioMasterId,
        organization_id: organizationId,
        org_status: orgStatus,
        input_status: scenario.status
      })
      
      try {
        const { data: orgData, error: orgScenarioError } = await supabase
          .from('organization_scenarios')
          .insert({
            organization_id: organizationId,
            scenario_master_id: scenarioMasterId,
            slug: scenario.slug || null,
            duration: scenario.duration || null,
            participation_fee: scenario.participation_fee || null,
            extra_preparation_time: scenario.extra_preparation_time ?? null,
            org_status: orgStatus,
            license_amount: scenario.license_amount || null,
            gm_test_license_amount: scenario.gm_test_license_amount || null,
            franchise_license_amount: scenario.franchise_license_amount || null,
            franchise_gm_test_license_amount: scenario.franchise_gm_test_license_amount || null,
            gm_count: scenario.gm_count || null,
            gm_costs: scenario.gm_costs || [],
            available_stores: scenario.available_stores || [],
            production_costs: scenario.production_costs || [],
            play_count: scenario.play_count || 0,
          })
          .select()
          .single()

        if (orgScenarioError) {
          logger.error('❌ organization_scenarios作成エラー:', orgScenarioError)
        } else {
          logger.log('✅ organization_scenarios作成成功:', orgData?.id)
        }
      } catch (err) {
        logger.error('❌ organization_scenarios作成で例外:', err)
      }
    } else {
      logger.log('⚠️ organization_scenarios作成スキップ:', {
        scenarioMasterId,
        organizationId
      })
    }

    // ========================================
    // STEP 3: scenarios に追加（旧UI用・後方互換）
    // ========================================
    // scenario_master_idを設定して連携
    if (scenarioMasterId) {
      dbData.scenario_master_id = scenarioMasterId
    }
    
    const { data, error } = await supabase
      .from('scenarios')
      .insert([dbData])
      .select()
      .single()
    
    if (error) {
      logger.error('シナリオ作成エラー:', error)
      throw error
    }
    
    logger.log('✅ scenarios作成成功（3テーブル同期完了）')
    return data
  },

  // シナリオを更新
  // id: scenarios.id または scenario_master_id のどちらでも検索可能
  async update(id: string, updates: Partial<Scenario>): Promise<Scenario> {
    // DBに存在するカラムのみを抽出（UI専用フィールドを除外）
    const dbData = extractDbColumns(updates)
    
    logger.log('📝 シナリオ更新データ:', Object.keys(dbData))
    
    // 現在の組織IDを取得
    const orgId = await getCurrentOrganizationId()
    
    // まず対象のシナリオを特定（id または scenario_master_id で検索）
    let targetScenario: { id: string; scenario_master_id?: string } | null = null
    
    // idで検索
    const { data: byId } = await supabase
      .from('scenarios')
      .select('id, scenario_master_id')
      .eq('id', id)
      .maybeSingle()
    
    if (byId) {
      targetScenario = byId
    } else {
      // scenario_master_id + organization_id で検索
      logger.log('📝 idで見つからず、scenario_master_id + organization_idで検索:', id, orgId)
      let query = supabase
        .from('scenarios')
        .select('id, scenario_master_id')
        .eq('scenario_master_id', id)
      
      if (orgId) {
        query = query.eq('organization_id', orgId)
      }
      
      const { data: byMasterId } = await query.maybeSingle()
      if (byMasterId) {
        targetScenario = byMasterId
      }
    }
    
    if (!targetScenario) {
      throw new Error('シナリオが見つかりません。')
    }
    
    logger.log('📝 更新対象シナリオ特定:', targetScenario.id)
    
    // 特定したIDで更新
    const { data, error } = await supabase
      .from('scenarios')
      .update(dbData)
      .eq('id', targetScenario.id)
      .select()
      .single()
    
    if (error) {
      logger.error('シナリオ更新エラー:', error)
      throw error
    }
    
    // organization_scenariosも同期更新（対応するカラムのみ）
    const scenarioMasterId = targetScenario.scenario_master_id || targetScenario.id
    if (orgId && scenarioMasterId) {
      const orgScenarioData: Record<string, unknown> = {}
      
      // statusはorg_statusにマッピング
      if (dbData.status) {
        // available/unavailable/coming_soon のみ有効
        const validOrgStatuses = ['available', 'unavailable', 'coming_soon']
        if (validOrgStatuses.includes(dbData.status as string)) {
          orgScenarioData.org_status = dbData.status
        }
      }
      
      // 組織固有カラムをマッピング（organization_scenarios に保存）
      const orgColumnMapping: Record<string, string> = {
        // 組織固有の運用フィールド
        'duration': 'duration',
        'participation_fee': 'participation_fee',
        'extra_preparation_time': 'extra_preparation_time',
        'license_amount': 'license_amount',
        'gm_test_license_amount': 'gm_test_license_amount',
        'available_gms': 'available_gms',
        'available_stores': 'available_stores',
        'gm_costs': 'gm_costs',
        'production_costs': 'production_costs',
        'play_count': 'play_count',
        'notes': 'notes',
        // override フィールド（マスター情報の組織固有上書き）
        'title': 'override_title',
        'author': 'override_author',
        'genre': 'override_genre',
        'difficulty': 'override_difficulty',
        'player_count_min': 'override_player_count_min',
        'player_count_max': 'override_player_count_max',
        // custom フィールド
        'key_visual_url': 'custom_key_visual_url',
        'description': 'custom_description',
        'synopsis': 'custom_synopsis',
        'caution': 'custom_caution',
      }
      
      for (const [scenarioCol, orgCol] of Object.entries(orgColumnMapping)) {
        if (dbData[scenarioCol] !== undefined) {
          orgScenarioData[orgCol] = dbData[scenarioCol]
        }
      }
      
      if (Object.keys(orgScenarioData).length > 0) {
        orgScenarioData.updated_at = new Date().toISOString()
        logger.log('📝 organization_scenarios同期更新:', Object.keys(orgScenarioData))
        const { error: orgError } = await supabase
          .from('organization_scenarios')
          .update(orgScenarioData)
          .eq('scenario_master_id', scenarioMasterId)
          .eq('organization_id', orgId)
        
        if (orgError) {
          logger.error('organization_scenarios更新エラー（無視）:', orgError)
          // エラーは無視（メインの更新は成功しているため）
        }
      }
      
      // NOTE: scenario_masters への書き込みは行わない。
      // マスター情報の更新はマスター編集画面（権利者用）の責務。
      // 組織固有の上書きは override_* / custom_* カラムに保存済み。
      
      // 組織が「公開中」にした場合、マスターがdraftならpendingに昇格
      if (dbData.status === 'available') {
        const { data: masterData } = await supabase
          .from('scenario_masters')
          .select('id, master_status')
          .eq('id', scenarioMasterId)
          .maybeSingle()
        
        if (masterData && masterData.master_status === 'draft') {
          logger.log('📝 マスターをdraft→pendingに昇格:', scenarioMasterId)
          await supabase
            .from('scenario_masters')
            .update({ master_status: 'pending', updated_at: new Date().toISOString() })
            .eq('id', scenarioMasterId)
        }
      }
    }
    
    return data
  },

  // シナリオを削除
  async delete(id: string): Promise<void> {
    // 組織フィルタ（マルチテナント対応）
    const orgId = await getCurrentOrganizationId()
    
    // 関連データの参照をクリア（スケジュールイベントは削除しない）
    
    // 1. reservationsのscenario_idをNULLに設定（組織フィルタ付き）
    const { error: reservationError } = await supabase.rpc('admin_clear_reservations_scenario_id', {
      p_scenario_id: id
    })
    
    if (reservationError) throw reservationError
    
    // 2. schedule_eventsのscenario_idをNULLに設定（組織フィルタ付き）
    let scheduleQuery = supabase
      .from('schedule_events')
      .update({ scenario_id: null })
      .eq('scenario_id', id)
    
    if (orgId) {
      scheduleQuery = scheduleQuery.eq('organization_id', orgId)
    }
    
    const { error: scheduleError } = await scheduleQuery
    
    if (scheduleError) throw scheduleError
    
    // 3. staff_scenario_assignmentsの削除（scenario_master_id で検索、組織フィルタ付き）
    // scenario_id は scenario_master_id と統一済みのため、
    // scenarios テーブルから scenario_master_id を取得して検索
    const { data: scenarioRow } = await supabase
      .from('scenarios')
      .select('scenario_master_id')
      .eq('id', id)
      .maybeSingle()
    const assignmentScenarioId = scenarioRow?.scenario_master_id || id
    
    let assignQuery = supabase
      .from('staff_scenario_assignments')
      .delete()
      .eq('scenario_id', assignmentScenarioId)
    
    if (orgId) {
      assignQuery = assignQuery.eq('organization_id', orgId)
    }
    
    const { error: assignmentError } = await assignQuery
    
    if (assignmentError) throw assignmentError
    
    // 4. performance_kitsの削除
    const { error: kitsError } = await supabase
      .from('performance_kits')
      .delete()
      .eq('scenario_id', id)
    
    if (kitsError) throw kitsError
    
    // 5. スタッフのspecial_scenariosからこのシナリオを削除（組織フィルタ付き）
    let staffQuery = supabase
      .from('staff')
      .select('id, special_scenarios')
      .contains('special_scenarios', [id])
    
    if (orgId) {
      staffQuery = staffQuery.eq('organization_id', orgId)
    }
    
    const { data: affectedStaff, error: staffError } = await staffQuery
    
    if (staffError) throw staffError
    
    // 各スタッフのspecial_scenariosからシナリオIDを削除
    if (affectedStaff && affectedStaff.length > 0) {
      const updatePromises = affectedStaff.map(staff => {
        const newScenarios = (staff.special_scenarios || []).filter((sid: string) => sid !== id)
        return supabase
          .from('staff')
          .update({ special_scenarios: newScenarios })
          .eq('id', staff.id)
      })
      
      await Promise.all(updatePromises)
    }
    
    // 6. シナリオ本体の削除（組織フィルタ付き）
    let deleteQuery = supabase
      .from('scenarios')
      .delete()
      .eq('id', id)
    
    if (orgId) {
      deleteQuery = deleteQuery.eq('organization_id', orgId)
    }
    
    const { error } = await deleteQuery
    
    if (error) throw error
  },

  // シナリオの担当GMを更新
  async updateAvailableGms(id: string, availableGms: string[]): Promise<Scenario> {
    const { data, error } = await supabase
      .from('scenarios')
      .update({ available_gms: availableGms })
      .eq('id', id)
      .select()
      .single()
    
    if (error) throw error
    return data
  },

  // シナリオの累計公演回数を取得
  // scenarioId は scenarios.id または scenario_master_id のどちらでも対応
  async getPerformanceCount(scenarioId: string): Promise<number> {
    // IDを解決（scenario_master_id の場合は対応する scenarios.id リストを取得）
    const scenarioIds = await resolveScenarioIds(scenarioId)
    
    // 組織フィルタ（マルチテナント対応）
    const orgId = await getCurrentOrganizationId()
    
    let query = supabase
      .from('schedule_events')
      .select('*', { count: 'exact', head: true })
      .in('scenario_id', scenarioIds)
      .not('status', 'eq', 'cancelled') // キャンセルを除外
    
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
  }> {
    // 今日の日付（YYYY-MM-DD形式）
    const today = new Date().toISOString().split('T')[0]
    
    // 組織フィルタ（マルチテナント対応）
    const orgId = await getCurrentOrganizationId()
    
    // IDを解決（scenario_master_id の場合は対応する scenarios.id リストを取得）
    const scenarioIds = await resolveScenarioIds(scenarioId)
    logger.log('📊 getScenarioStats: resolveScenarioIds', { input: scenarioId, resolved: scenarioIds })

    // シナリオの最大参加者数とライセンス料を取得
    const { data: scenarioData } = await supabase
      .from('scenarios')
      .select('player_count_max, license_amount, gm_test_license_amount, license_rewards')
      .in('id', scenarioIds)
      .limit(1)
      .single()
    const maxParticipants = scenarioData?.player_count_max || 99
    const defaultLicenseAmount = scenarioData?.license_amount || 0
    const defaultGmTestLicenseAmount = scenarioData?.gm_test_license_amount || 0
    // license_rewards からも取得を試みる（新形式対応）
    const licenseRewards = scenarioData?.license_rewards as Array<{ item: string; amount: number }> | undefined
    const normalLicenseFromRewards = licenseRewards?.find(r => r.item === 'normal')?.amount
    const gmTestLicenseFromRewards = licenseRewards?.find(r => r.item === 'gmtest')?.amount
    const normalLicenseAmount = normalLicenseFromRewards ?? defaultLicenseAmount
    const gmTestLicenseAmount = gmTestLicenseFromRewards ?? defaultGmTestLicenseAmount

    // 公演回数（中止以外、今日まで、出張公演除外）
    let perfQuery = supabase
      .from('schedule_events')
      .select('*', { count: 'exact', head: true })
      .in('scenario_id', scenarioIds)
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
      .in('scenario_id', scenarioIds)
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
      .select('date, scenario_id')
      .in('scenario_id', scenarioIds)
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
      .in('scenario_id', scenarioIds)
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
      // 全予約を取得（確定済みのみ、組織フィルタ付き）
      let resQuery = supabase
        .from('reservations')
        .select('schedule_event_id, participant_count, reservation_source, payment_method')
        .in('schedule_event_id', eventIds)
        .in('status', ['confirmed', 'gm_confirmed'])
      
      if (orgId) {
        resQuery = resQuery.eq('organization_id', orgId)
      }
      
      const { data: allReservations, error: resError } = await resQuery
      
      if (!resError && allReservations) {
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

    // デバッグログ（本番では削除可）
    logger.log('📊 シナリオ統計:', {
      scenarioId,
      maxParticipants,
      performanceCount: performanceCount || 0,
      totalParticipants,
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
      performanceDates
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

  // シナリオの担当GMを更新（スタッフのspecial_scenariosも同期更新）
  async updateAvailableGmsWithSync(id: string, availableGms: string[]): Promise<Scenario> {
    // シナリオの担当GMを更新
    const { data: updatedScenario, error: updateError } = await supabase
      .from('scenarios')
      .update({ available_gms: availableGms })
      .eq('id', id)
      .select()
      .single()
    
    if (updateError) throw updateError

    // 全スタッフを取得して、各スタッフのspecial_scenariosを更新
    const { data: allStaff, error: staffError } = await supabase
      .from('staff')
      .select('id, name, special_scenarios')
    
    if (staffError) throw staffError

    // 各スタッフのspecial_scenariosを更新
    const updatePromises = allStaff?.map(async (staff) => {
      const currentScenarios = staff.special_scenarios || []
      const staffName = staff.name
      
      // このスタッフが担当GMに含まれているかチェック
      const isAssigned = availableGms.includes(staffName)
      const isCurrentlyAssigned = currentScenarios.includes(id)
      
      let newScenarios = [...currentScenarios]
      
      if (isAssigned && !isCurrentlyAssigned) {
        // 担当GMに追加された場合、special_scenariosに追加
        newScenarios.push(id)
      } else if (!isAssigned && isCurrentlyAssigned) {
        // 担当GMから削除された場合、special_scenariosから削除
        newScenarios = newScenarios.filter(scenarioId => scenarioId !== id)
      }
      
      // 変更がある場合のみ更新
      if (JSON.stringify(newScenarios.sort()) !== JSON.stringify(currentScenarios.sort())) {
        return supabase
          .from('staff')
          .update({ special_scenarios: newScenarios })
          .eq('id', staff.id)
      }
      
      return Promise.resolve()
    }) || []

    // 全てのスタッフ更新を実行
    await Promise.all(updatePromises)

    return updatedScenario
  }
}


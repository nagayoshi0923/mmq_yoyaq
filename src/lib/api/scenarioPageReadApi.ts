/**
 * シナリオの一覧・詳細ページの読み取りAPI
 *
 * 画面・フックから supabase を直接呼ばず、ここを通す（整備 Phase 2、#773）。
 * 絞り込み条件・select の列・戻り値（{ data, error }）は元の呼び出しのまま。
 */
import { supabase } from '@/lib/supabase'

const ORG_SCENARIOS_WITH_MASTER_LIST_SELECT = `
  id,
  org_scenario_id,
  organization_id,
  scenario_master_id,
  slug,
  org_status,
  pricing_patterns,
  gm_assignments,
  created_at,
  updated_at,
  extra_preparation_time,
  kit_count,
  title,
  author,
  author_id,
  key_visual_url,
  description,
  synopsis,
  caution,
  player_count_min,
  player_count_max,
  duration,
  genre,
  difficulty,
  participation_fee,
  master_status,
  play_count,
  available_gms,
  available_stores,
  gm_costs,
  gm_count,
  license_amount,
  gm_test_license_amount,
  experienced_staff
` as const

export const scenarioPageReadApi = {
  /** 店舗の一覧（カタログの対応店舗表示用） */
  async listStoresForCatalog() {
    return supabase.from('stores').select('id, name, short_name, ownership_type, region, address, display_order')
  },

  /** 有効な予約の注意事項（公演の種別で絞る） */
  async listActiveBookingNotices(categoryType: string) {
    return supabase
      .from('booking_notices')
      .select('id, content, applicable_types, store_id, store_ids, requires_pre_reading, organization_id')
      .eq('is_active', true)
      .contains('applicable_types', [categoryType])
      .order('sort_order', { ascending: true })
  },

  /** 稼働中の店舗（臨時・オフィスを除く。名前順） */
  async listActiveStoresForHero() {
    return supabase
      .from('stores')
      .select('id, name, short_name')
      .eq('status', 'active')
      .neq('is_temporary', true)
      .or('ownership_type.neq.office,ownership_type.is.null')
      .order('name')
  },

  /** 公演の現在の人数・定員（予約直前の再確認用） */
  async findEventSeats(eventId: string) {
    return supabase
      .from('schedule_events_public')
      .select('current_participants, max_participants, capacity')
      .eq('id', eventId)
      .single()
  },
}

export const scenarioCatalogReadApi = {
  /** カタログ: 公開中のシナリオ（ガイド用を除く）を題名順。組織が分かれば絞る */
  async listAvailableScenarios(organizationId: string | null | undefined) {
    let scenariosQuery = supabase
      .from('organization_scenarios_with_master')
      .select(
        'id, org_scenario_id, slug, title, author, key_visual_url, duration, player_count_min, player_count_max, genre, participation_fee, difficulty, release_date, status, scenario_master_id, available_stores, is_recommended, scenario_type, organization_id'
      )
      .eq('status', 'available')
      .neq('scenario_type', 'gm_test')
      .order('title', { ascending: true })
    if (organizationId) {
      scenariosQuery = scenariosQuery.eq('organization_id', organizationId)
    }
    return scenariosQuery
  },
}

export const scenarioDetailEventsReadApi = {
  /** 公演（公開ビュー）の問い合わせを始める。絞り込み・並び順は呼び出し側が足す（builder を返す） */
  startPublicEventsQuery(select: string) {
    return supabase.from('schedule_events_public').select(select)
  },
}

export const scenarioDetailGlobalReadApi = {
  /** slug から、組織のシナリオのマスタ id（1件） */
  async findMasterIdBySlug(slug: string) {
    return supabase
      .from('organization_scenarios')
      .select('scenario_master_id')
      .eq('slug', slug)
      .limit(1)
  },

  /** id がシナリオマスタの id かを確認（1件） */
  async findMasterById(id: string) {
    return supabase.from('scenario_masters').select('id').eq('id', id).limit(1)
  },

  /** 旧形式: 組織のシナリオ id から、マスタ id（1件） */
  async findMasterIdByOrgScenarioId(id: string) {
    return supabase.from('organization_scenarios').select('scenario_master_id').eq('id', id).limit(1)
  },

  /** シナリオマスタの詳細（1件） */
  async getMasterDetail(masterId: string) {
    return supabase
      .from('scenario_masters')
      .select('id, title, author, author_id, key_visual_url, description, player_count_min, player_count_max, official_duration, genre, synopsis, caution, required_items, master_status, created_at, updated_at, gallery_images')
      .eq('id', masterId)
      .limit(1)
  },

  /** マスタに紐づく組織のシナリオ表示ビュー（1件） */
  async findLegacyScenarioView(masterId: string) {
    return supabase
      .from('organization_scenarios_with_master')
      .select('id, org_scenario_id, title, slug, description, key_visual_url, duration, player_count_min, player_count_max, organization_id, author, genre, participation_fee, synopsis')
      .eq('scenario_master_id', masterId)
      .limit(1)
      .maybeSingle()
  },

  /** マスタの公開キャラクター（並び順） */
  async listVisibleCharacters(masterId: string) {
    return supabase.from('scenario_characters').select('id, name, description, image_url, sort_order').eq('scenario_master_id', masterId).eq('is_visible', true).order('sort_order', { ascending: true })
  },

  /** 組織のシナリオに保存されたキャラクター（1件） */
  async findOrganizationCharacters(masterId: string) {
    return supabase.from('organization_scenarios').select('characters').eq('scenario_master_id', masterId).not('characters', 'is', null).limit(1)
  },

  /** マスタを扱う組織の id */
  async listOrganizationIdsOfMaster(masterId: string) {
    return supabase.from('organization_scenarios').select('organization_id').eq('scenario_master_id', masterId)
  },

  /** 組織の id・slug・名前を id で */
  async listOrganizationsByIds(orgIds: string[]) {
    return supabase.from('organizations').select('id, slug, name').in('id', orgIds)
  },

  /** 公開中の組織のシナリオ（組織つき） */
  async listAvailableOrgScenariosWithOrganization(masterId: string) {
    return supabase.from('organization_scenarios').select('id, organization_id, organizations!inner (id, slug, name)').eq('scenario_master_id', masterId).eq('org_status', 'available')
  },

  /** 公開中の組織のシナリオ（slug つき） */
  async listAvailableOrgScenarios(masterId: string) {
    return supabase.from('organization_scenarios').select('id, organization_id, slug').eq('scenario_master_id', masterId).eq('org_status', 'available')
  },

  /** マスタの今後の公演（公開ビュー、最大50件） */
  async listUpcomingPublicEvents(masterId: string, today: string) {
    return supabase
      .from('schedule_events_public')
      .select('id, date, start_time, time_slot, current_participants, max_participants, capacity, organization_id, store_id, is_reservation_enabled, is_private_booking')
      .eq('scenario_master_id', masterId)
      .gte('date', today)
      .in('category', ['open', 'offsite'])
      .order('date', { ascending: true })
      .order('start_time', { ascending: true })
      .limit(50)
  },

  /** 店舗（公開ビュー）を id で */
  async listPublicStoresByIds(storeIds: string[]) {
    return supabase.from('stores_public').select('id, name, short_name, color, region').in('id', storeIds)
  },

  /** メールで顧客の id（1件） */
  async findCustomerIdByEmail(email: string) {
    return supabase.from('customers').select('id').eq('email', email).maybeSingle()
  },
}

export const scenarioManagementReadApi = {
  /** 組織のシナリオを削除する（RPC） */
  async deleteOrganizationScenario(orgScenarioId: string) {
    return supabase.rpc('delete_org_scenario', {
        p_scenario_id: orgScenarioId
      })
  },

  /** 組織のカテゴリ（並び順） */
  async listCategories(organizationId: string) {
    return supabase
      .from('organization_categories')
      .select('id, name, sort_order')
      .eq('organization_id', organizationId)
      .order('sort_order', { ascending: true })
  },

  /** 組織の作者（並び順） */
  async listAuthors(organizationId: string) {
    return supabase
      .from('organization_authors')
      .select('id, name, sort_order')
      .eq('organization_id', organizationId)
      .order('sort_order', { ascending: true })
  },

  /** 組織の名前 */
  async findOrganizationName(organizationId: string) {
    return supabase.from('organizations').select('name').eq('id', organizationId).single()
  },

  /** 組織の店舗（名前・略称・所有区分・臨時） */
  async listStoresOfOrganization(organizationId: string) {
    return supabase.from('stores').select('id, name, short_name, ownership_type, is_temporary').eq('organization_id', organizationId)
  },

  /** 組織のシナリオ表示ビュー（題名順） */
  async listScenarioViews(organizationId: string) {
    return supabase
      .from('organization_scenarios_with_master')
      .select(ORG_SCENARIOS_WITH_MASTER_LIST_SELECT)
      .eq('organization_id', organizationId)
      .order('title', { ascending: true })
  },

  /** 組織のシナリオの対応店舗（マスタ id で） */
  async listAvailableStoresByMasterIds(organizationId: string, masterIds: string[]) {
    return supabase
      .from('organization_scenarios')
      .select('scenario_master_id, available_stores')
      .eq('organization_id', organizationId)
      .in('scenario_master_id', masterIds)
  },

  /** GM 担当（メイン・サブ可。スタッフ名つき） */
  async listGmAssignments(organizationId: string, masterIds: string[]) {
    return supabase
      .from('staff_scenario_assignments')
      .select('scenario_master_id, can_main_gm, can_sub_gm, staff:staff_id ( name )')
      .eq('organization_id', organizationId)
      .in('scenario_master_id', masterIds)
      .or('can_main_gm.eq.true,can_sub_gm.eq.true')
  },
}

export const scenarioMasterAdminReadApi = {
  /** シナリオマスタを全項目で1件（管理画面） */
  async getMasterForEdit(id: string) {
    return supabase
      .from('scenario_masters')
      .select('id, title, author, author_id, author_email, key_visual_url, description, synopsis, player_count_min, player_count_max, official_duration, weekend_duration, genre, difficulty, caution, required_items, has_pre_reading, release_date, official_site_url, master_status, submitted_by_organization_id, approved_by, approved_at, rejection_reason, created_at, updated_at, created_by')
      .eq('id', id)
      .single()
  },

  /** マスタのキャラクター（並び順） */
  async listCharacters(masterId: string) {
    return supabase
      .from('scenario_characters')
      .select('id, scenario_master_id, name, description, image_url, sort_order')
      .eq('scenario_master_id', masterId)
      .order('sort_order', { ascending: true })
  },

  /** 保留中の修正リクエスト（組織名つき、新しい順） */
  async listPendingCorrections(masterId: string) {
    return supabase
      .from('scenario_master_corrections')
      .select(`
        *,
        organizations:requested_by_organization_id (name)
      `)
      .eq('scenario_master_id', masterId)
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
  },

  /** シナリオマスタの一覧（更新の新しい順） */
  async listMasters() {
    return supabase
      .from('scenario_masters')
      .select('id, title, author, author_id, key_visual_url, description, player_count_min, player_count_max, official_duration, genre, difficulty, synopsis, caution, required_items, master_status, submitted_by_organization_id, approved_by, approved_at, rejection_reason, created_at, updated_at, created_by')
      .order('updated_at', { ascending: false })
  },

  /** 組織のシナリオ（マスタ id と組織 id） */
  async listOrganizationScenarioLinks() {
    return supabase
      .from('organization_scenarios')
      .select('scenario_master_id, organization_id')
  },

  /** 組織の id と名前を id で */
  async listOrganizationNamesByIds(orgIds: string[]) {
    return supabase
      .from('organizations')
      .select('id, name')
      .in('id', orgIds)
  },
}

export const scenarioMatcherReadApi = {
  /** シナリオ名が入っている公演を新しい順（シナリオ紐付け画面）。組織が分かれば絞る */
  async listEventsWithScenarioName(organizationId: string | null | undefined) {
    let eventsQuery = supabase
      .from('schedule_events')
      .select('id, date, scenario, venue')
      .not('scenario', 'is', null)

    if (organizationId) {
      eventsQuery = eventsQuery.eq('organization_id', organizationId)
    }

    return eventsQuery.order('date', { ascending: false })
  },
  /** 組織のシナリオの題名だけ（紐付け済みの判定用）。組織が分かれば絞る */
  async listScenarioTitles(organizationId: string | null | undefined) {
    let scenariosQuery = supabase
      .from('organization_scenarios_with_master')
      .select('title')

    if (organizationId) {
      scenariosQuery = scenariosQuery.eq('organization_id', organizationId)
    }

    return scenariosQuery
  },
  /** 組織のシナリオ（id と題名）を題名順。組織が分かれば絞る */
  async listScenarios(organizationId: string | null | undefined) {
    let query = supabase
      .from('organization_scenarios_with_master')
      .select('id, title')

    if (organizationId) {
      query = query.eq('organization_id', organizationId)
    }

    return query.order('title')
  },
}

